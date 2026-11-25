import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBuckets } from '@/lib/rate-limit'
import { orders } from '@/db/schema/orders'

const ORDER_ID = '3aa6e85b-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

interface Session {
  user?: { id?: string; email?: string }
}

let session: Session | null = null
/** What the in-transaction select finds. */
let found: { status: string; totalMmk: string; stockReserved?: boolean }[] = []
/** The order's lines, read back when stock is returned. */
let itemLines: { productId: string; qty: number }[] = []
let txSelectCalls = 0
/** When set, reading the order's lines fails inside the transaction. */
let linesFail = false
/** `affectedRows` the status update reports. 0 means something else moved it first. */
let updateAffects = 1
const sets: unknown[] = []
/** Every `.where()` condition the route built, in order. */
const wheres: unknown[] = []

const { sendMail, sendTelegram } = vi.hoisted(() => ({
  sendMail: vi.fn<(p: { to: string; subject: string }) => Promise<{ delivered: boolean }>>(
    async () => ({ delivered: true }),
  ),
  sendTelegram: vi.fn<(text: string) => Promise<boolean>>(async () => true),
}))

vi.mock('@/lib/auth', () => ({ auth: async () => session }))
vi.mock('@/lib/mail', () => ({ sendMail }))
vi.mock('@/lib/telegram', () => ({ sendTelegram }))
vi.mock('@emails/order-cancelled', () => ({ OrderCancelled: () => null }))

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag }))

// Conditions are reduced to plain records so a test can read the guard on a write.
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: (...conds: unknown[]) => ({ and: conds }),
  eq: (col: unknown, value: unknown) => ({ eq: [col, value] }),
  inArray: (col: unknown, values: unknown) => ({ inArray: [col, values] }),
}))

vi.mock('@/db', () => {
  function chain(result: () => unknown) {
    const c: Record<string, unknown> = {
      from: () => c,
      where: (cond: unknown) => {
        wheres.push(cond)
        return c
      },
      limit: () => c,
      set: (patch: unknown) => {
        sets.push(patch)
        return c
      },
      then: (resolve: (value: unknown) => unknown, reject: (err: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    }
    return c
  }
  const tx = {
    // First the order itself, then (when stock goes back) its lines.
    select: () =>
      chain(() => {
        if (txSelectCalls++ === 0) return found
        if (linesFail) return Promise.reject(new Error('lock wait timeout'))
        return itemLines
      }),
    // mysql2 hands back [ResultSetHeader, FieldPacket[]].
    update: () => chain(() => [{ affectedRows: updateAffects }, []]),
  }
  return {
    db: {
      transaction: async (cb: (t: typeof tx) => Promise<unknown>) => {
        txSelectCalls = 0
        return cb(tx)
      },
    },
  }
})

const { POST } = await import('./route')

let ip = 0
function cancel(): Request {
  ip += 1
  return new Request(`http://localhost/api/v1/orders/${ORDER_ID}/cancel`, {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.9.0.${ip}` },
  })
}

function ctx(id: string = ORDER_ID) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  session = { user: { id: 'u1', email: 'buyer@example.com' } }
  found = [{ status: 'pending_payment', totalMmk: '25000' }]
  updateAffects = 1
  itemLines = [{ productId: 'kestrel-75', qty: 2 }]
  txSelectCalls = 0
  linesFail = false
  revalidateTag.mockClear()
  sets.length = 0
  wheres.length = 0
  sendMail.mockClear()
  resetBuckets()
})

describe('POST /api/v1/orders/[id]/cancel', () => {
  it('refuses an anonymous caller', async () => {
    session = null
    expect((await POST(cancel(), ctx())).status).toBe(401)
  })

  it('refuses an id that is not a uuid', async () => {
    expect((await POST(cancel(), ctx('../x'))).status).toBe(400)
  })

  it("answers 404 for an order that is not the caller's", async () => {
    found = []
    expect((await POST(cancel(), ctx())).status).toBe(404)
    expect(sets).toHaveLength(0)
  })

  it('refuses an order that is no longer pending', async () => {
    found = [{ status: 'payment_submitted', totalMmk: '25000' }]
    expect((await POST(cancel(), ctx())).status).toBe(409)
    expect(sets).toHaveLength(0)
  })

  it('cancels a pending order and emails the customer', async () => {
    const res = await POST(cancel(), ctx())
    expect(res.status).toBe(200)
    expect(sets).toEqual([{ status: 'cancelled' }])
    expect(sendMail).toHaveBeenCalledOnce()
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({
      to: 'buyer@example.com',
      subject: 'Order 3AA6E85B - cancelled',
    })
  })

  it('still cancels when the email fails, and tells the owner which order', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp down'))
    const res = await POST(cancel(), ctx())
    expect(res.status).toBe(200)
    expect(sendTelegram).toHaveBeenCalledWith(expect.stringContaining('3AA6E85B cancelled (customer)'))
  })

  it('sends no second email when the order moved between the read and the write', async () => {
    // The unpaid-order sweep cancelled it, or a slip upload moved it on, after
    // the select saw pending_payment.
    updateAffects = 0
    expect((await POST(cancel(), ctx())).status).toBe(409)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('limits cancel attempts per user', async () => {
    for (let i = 0; i < 5; i++) {
      const r = new Request(`http://localhost/api/v1/orders/${ORDER_ID}/cancel`, {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.9.9.9' },
      })
      expect((await POST(r, ctx())).status).toBe(200)
    }
    const blocked = new Request(`http://localhost/api/v1/orders/${ORDER_ID}/cancel`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.9.9.9' },
    })
    expect((await POST(blocked, ctx())).status).toBe(429)
  })
})

describe('POST /api/v1/orders/[id]/cancel status guard', () => {
  it("cancels only the caller's order, and only while it is still pending", async () => {
    await POST(cancel(), ctx())
    expect(wheres).toContainEqual({
      and: [
        { eq: [orders.id, ORDER_ID] },
        { eq: [orders.userId, 'u1'] },
        { eq: [orders.status, 'pending_payment'] },
      ],
    })
  })
})

describe('POST /api/v1/orders/[id]/cancel on an order that reserved stock', () => {
  it('returns the stock after winning the cancel', async () => {
    found = [{ status: 'pending_payment', totalMmk: '25000', stockReserved: true }]

    const res = await POST(cancel(), ctx())

    expect(res.status).toBe(200)
    expect(sets[0]).toEqual({ status: 'cancelled' })
    expect(sets[1]).toHaveProperty('stockQty')
    expect(revalidateTag).toHaveBeenCalledWith('products')
  })

  it('returns nothing for an order that never reserved', async () => {
    found = [{ status: 'pending_payment', totalMmk: '25000', stockReserved: false }]
    await POST(cancel(), ctx())
    expect(sets).toEqual([{ status: 'cancelled' }])
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('returns nothing when something else moved the order first', async () => {
    found = [{ status: 'pending_payment', totalMmk: '25000', stockReserved: true }]
    updateAffects = 0
    expect((await POST(cancel(), ctx())).status).toBe(409)
    expect(sets).toEqual([{ status: 'cancelled' }])
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/orders/[id]/cancel when returning stock fails', () => {
  it('fails the request without emailing or touching the catalog cache', async () => {
    // The transaction rolls the cancel back with the stock, so the order is
    // still pending and the customer must not hear otherwise.
    found = [{ status: 'pending_payment', totalMmk: '25000', stockReserved: true }]
    linesFail = true

    await expect(POST(cancel(), ctx())).rejects.toThrow('lock wait timeout')
    expect(sendMail).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
