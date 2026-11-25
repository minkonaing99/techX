import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fail } from '@/lib/api-response'
import { orders } from '@/db/schema/orders'

const ORDER_ID = '3aa6e85b-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

let admin = true
/** One entry per `db.select()` outside the transaction, in order. */
let selects: unknown[][] = []
/** One entry per `tx.select()` inside the transaction, in order. */
let txSelects: unknown[][] = []
/** `affectedRows` the order status update reports. 0 means the order moved on meanwhile. */
let statusAffects = 1

const updates: unknown[] = []
/** Every `.where()` condition the route built, in order. */
const wheres: unknown[] = []
const revalidateTag = vi.fn()
const sendMail = vi.fn<(params: { subject: string }) => Promise<{ delivered: boolean }>>(
  async () => ({ delivered: true }),
)

/** Subjects of every mail the route sent, in order. */
function subjects(): string[] {
  return sendMail.mock.calls.map(([params]) => params.subject)
}

vi.mock('@/lib/admin-guard', () => ({
  requireAdmin: async () => (admin ? null : fail('FORBIDDEN', 'Admin only.', 403)),
}))
vi.mock('next/cache', () => ({ revalidateTag: (t: string) => revalidateTag(t) }))
vi.mock('@/lib/mail', () => ({ sendMail: (p: { subject: string }) => sendMail(p) }))
const sendTelegram = vi.fn<(text: string) => Promise<boolean>>(async () => true)
vi.mock('@/lib/telegram', () => ({ sendTelegram: (t: string) => sendTelegram(t) }))
vi.mock('@emails/order-invoice', () => ({ OrderInvoice: () => null }))
vi.mock('@emails/order-delivered', () => ({ OrderDelivered: () => null }))
vi.mock('@emails/order-cancelled', () => ({ OrderCancelled: () => null }))
/** Props of the last SlipRejected email built. */
let rejectedProps: Record<string, unknown> | null = null
vi.mock('@emails/slip-rejected', () => ({
  SlipRejected: (props: Record<string, unknown>) => {
    rejectedProps = props
    return null
  },
}))

// Conditions are reduced to plain records so a test can read the guard on a write.
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: (...conds: unknown[]) => ({ and: conds }),
  eq: (col: unknown, value: unknown) => ({ eq: [col, value] }),
  inArray: (col: unknown, values: unknown) => ({ inArray: [col, values] }),
}))

vi.mock('@/db', () => {
  // Drizzle's builder is both chainable and awaitable, so every step returns the
  // same object and that object is a thenable.
  function chain(result: unknown, onSet?: (patch: unknown) => void) {
    const c: Record<string, unknown> = {
      from: () => c,
      where: (cond: unknown) => {
        wheres.push(cond)
        return c
      },
      limit: () => c,
      set: (patch: unknown) => {
        onSet?.(patch)
        return c
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(typeof result === 'function' ? result() : result).then(resolve),
    }
    return c
  }
  const tx = {
    select: () => chain(txSelects.shift() ?? []),
    // mysql2 hands back [ResultSetHeader, FieldPacket[]], so the header the
    // route reads affectedRows off is res[0], not res.
    // The status write is told apart from a stock write by what it sets.
    update: () => {
      let patch: unknown
      return chain(
        () => [{ affectedRows: patch && typeof patch === 'object' && 'status' in patch ? statusAffects : 1 }],
        (p) => {
          patch = p
          updates.push(p)
        },
      )
    },
  }
  return {
    db: {
      select: () => chain(selects.shift() ?? []),
      transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
    },
  }
})

const { PATCH } = await import('./route')

const ORDER = {
  id: ORDER_ID,
  userId: 'u1',
  status: 'payment_submitted',
  paymentMethodId: 'kbz',
  subtotalMmk: '30000',
  deliveryFeeMmk: '3000',
  totalMmk: '33000',
  placedAt: new Date('2026-08-19T03:35:00.000Z'),
  // Every order reserves its stock at checkout.
  stockReserved: true,
}
const WALLET = { id: 'kbz', name: 'KBZPay', kind: 'wallet' }
const CUSTOMER = { id: 'u1', email: 'buyer@example.com' }
const ITEM = { productId: 'p1', qty: 2 }

function ctx(id: string = ORDER_ID) {
  return { params: Promise.resolve({ id }) }
}

function request(body: unknown): Request {
  return new Request(`http://localhost/api/v1/admin/orders/${ORDER_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * The selects a commit performs: order, payment method, then (after the
 * transaction) the customer and the order items for the invoice.
 */
function commitSelects(order = ORDER) {
  selects = [[order], [WALLET], [CUSTOMER], [ITEM], [WALLET]]
  txSelects = []
}

beforeEach(() => {
  admin = true
  selects = []
  txSelects = []
  statusAffects = 1
  updates.length = 0
  wheres.length = 0
  revalidateTag.mockClear()
  sendMail.mockClear()
  rejectedProps = null
})

describe('PATCH /api/v1/admin/orders/[id]', () => {
  it('passes the admin guard refusal straight through', async () => {
    admin = false
    const res = await PATCH(request({ status: 'confirmed' }), ctx())
    expect(res.status).toBe(403)
    expect(updates).toHaveLength(0)
  })

  it('refuses an id that is not a uuid', async () => {
    const res = await PATCH(request({ status: 'confirmed' }), ctx('../../products'))
    expect(res.status).toBe(400)
    expect(selects).toHaveLength(0)
  })

  it('refuses a status outside the enum', async () => {
    expect((await PATCH(request({ status: 'refunded' }), ctx())).status).toBe(400)
  })

  it('refuses notes past the length cap', async () => {
    const res = await PATCH(request({ status: 'cancelled', notes: 'x'.repeat(2001) }), ctx())
    expect(res.status).toBe(400)
  })

  it('answers 404 for an order that does not exist', async () => {
    selects = [[]]
    expect((await PATCH(request({ status: 'confirmed' }), ctx())).status).toBe(404)
  })

  it('refuses a transition the state machine does not allow', async () => {
    selects = [[{ ...ORDER, status: 'delivered' }], [WALLET]]
    const res = await PATCH(request({ status: 'pending_payment' }), ctx())
    expect(res.status).toBe(409)
    expect(updates).toHaveLength(0)
  })

  it('restores stock when a confirmed order is cancelled', async () => {
    selects = [[{ ...ORDER, status: 'confirmed' }], [WALLET], [CUSTOMER]]
    txSelects = [[ITEM]]

    const res = await PATCH(request({ status: 'cancelled' }), ctx())
    expect(res.status).toBe(200)
    expect(updates).toHaveLength(2)
    expect(updates[0]).toMatchObject({ status: 'cancelled' })
    expect(updates[1]).toHaveProperty('stockQty')
    expect(revalidateTag).toHaveBeenCalledWith('products')
  })

  it('invoices the customer at confirmation', async () => {
    commitSelects()
    await PATCH(request({ status: 'confirmed' }), ctx())

    expect(subjects().some((s) => s.includes('payment confirmed'))).toBe(true)
  })

  it('notifies the customer on delivery', async () => {
    selects = [[{ ...ORDER, status: 'confirmed' }], [WALLET], [CUSTOMER]]
    await PATCH(request({ status: 'delivered' }), ctx())

    expect(subjects().some((s) => s.includes('delivered'))).toBe(true)
  })

  it('notifies the customer on cancellation', async () => {
    selects = [[ORDER], [WALLET], [CUSTOMER]]
    await PATCH(request({ status: 'cancelled', notes: 'Out of stock, sorry.' }), ctx())

    expect(subjects().some((s) => s.includes('cancelled'))).toBe(true)
  })

  it('still moves the order when the customer email fails, and tells the owner which one', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp down'))
    selects = [[{ ...ORDER, status: 'confirmed' }], [WALLET], [CUSTOMER]]
    const res = await PATCH(request({ status: 'delivered' }), ctx())

    expect(res.status).toBe(200)
    expect(sendTelegram).toHaveBeenCalledWith(expect.stringMatching(/^Email not sent: order \S+ delivered/))
  })

  it('does not try to mail a customer with no address on file', async () => {
    selects = [[ORDER], [WALLET], [{ id: 'u1', email: null }]]
    const res = await PATCH(request({ status: 'cancelled' }), ctx())

    expect(res.status).toBe(200)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('records the note the admin attached', async () => {
    selects = [[ORDER], [WALLET], [CUSTOMER]]
    await PATCH(request({ status: 'cancelled', notes: 'Customer asked to cancel.' }), ctx())

    expect(updates[0]).toMatchObject({ notes: 'Customer asked to cancel.' })
  })
})

describe('PATCH /api/v1/admin/orders/[id] racing the unpaid-order sweep', () => {
  it('refuses to confirm an order that changed after it was read', async () => {
    // The sweep cancelled the order between this request's read and its write.
    // Confirming would invoice an order the sweep already cancelled.
    commitSelects()
    statusAffects = 0

    const res = await PATCH(request({ status: 'confirmed' }), ctx())

    expect(res.status).toBe(409)
    expect(sendMail).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/v1/admin/orders/[id] status guard and slip rejection', () => {
  it('writes the status only if it is still the one this request read', async () => {
    commitSelects()
    await PATCH(request({ status: 'confirmed' }), ctx())
    expect(wheres).toContainEqual({
      and: [{ eq: [orders.id, ORDER_ID] }, { eq: [orders.status, 'payment_submitted'] }],
    })
  })

  it('gives a rejected slip a fresh 24 hours before the sweep may cancel it', async () => {
    // The order may be days old. Without a new expiry the hourly sweep would
    // cancel it at once and tell the customer their payment never arrived.
    selects = [[ORDER], [WALLET], [CUSTOMER]]
    const before = Date.now()

    const res = await PATCH(request({ status: 'pending_payment', reason: 'The amount on the slip does not match the order total.' }), ctx())

    expect(res.status).toBe(200)
    const patch = updates.at(-1) as { status: string; expiresAt?: Date }
    expect(patch.status).toBe('pending_payment')
    expect(patch.expiresAt?.getTime()).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000)
    expect(patch.expiresAt?.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000)
  })

  it('leaves the expiry alone on every other transition', async () => {
    commitSelects()
    await PATCH(request({ status: 'confirmed' }), ctx())
    expect(updates.at(-1)).not.toHaveProperty('expiresAt')
  })
})

describe('PATCH /api/v1/admin/orders/[id] claims the order before moving stock', () => {
  // Claiming first means every writer locks the order row before any product
  // row. The sweep and the customer cancel do the same, so two of them working
  // on one order queue up behind the order row instead of deadlocking.
  it('confirms nothing when another writer moved the order first', async () => {
    commitSelects()
    statusAffects = 0

    const res = await PATCH(request({ status: 'confirmed' }), ctx())

    expect(res.status).toBe(409)
    expect(updates).toEqual([{ status: 'confirmed' }])
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('returns no stock when another writer moved the order first', async () => {
    selects = [[{ ...ORDER, status: 'confirmed' }], [WALLET], [CUSTOMER]]
    txSelects = [[ITEM]]
    statusAffects = 0

    const res = await PATCH(request({ status: 'cancelled' }), ctx())

    expect(res.status).toBe(409)
    expect(updates).toHaveLength(1)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/v1/admin/orders/[id] stock held since checkout', () => {
  it('confirms without touching stock, and still invoices', async () => {
    selects = [[ORDER], [WALLET], [CUSTOMER], [ITEM], [WALLET]]
    txSelects = [[ITEM]]

    const res = await PATCH(request({ status: 'confirmed' }), ctx())

    expect(res.status).toBe(200)
    expect(updates).toEqual([{ status: 'confirmed' }])
    // The order's lines were never read for a stock move.
    expect(txSelects).toEqual([[ITEM]])
    expect(subjects().some((s) => s.includes('payment confirmed'))).toBe(true)
    expect(subjects().some((s) => s.startsWith('Low stock:') || s.startsWith('Sold out:'))).toBe(false)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('confirms a COD order the same way', async () => {
    const cod = { id: 'cod', name: 'Cash on Delivery', kind: 'cod' }
    selects = [[{ ...ORDER, status: 'pending_payment', paymentMethodId: 'cod' }], [cod], [CUSTOMER], [ITEM], [cod]]

    const res = await PATCH(request({ status: 'confirmed' }), ctx())

    expect(res.status).toBe(200)
    expect(updates).toEqual([{ status: 'confirmed' }])
    // Nothing is paid until the courier collects, so the subject must not say so.
    expect(subjects().some((s) => s.includes('order confirmed'))).toBe(true)
    expect(subjects().some((s) => s.includes('payment confirmed'))).toBe(false)
  })

  it.each(['pending_payment', 'payment_submitted'] as const)(
    'returns the stock when cancelled from %s',
    async (status) => {
      selects = [[{ ...ORDER, status }], [WALLET], [CUSTOMER]]
      txSelects = [[ITEM]]

      const res = await PATCH(request({ status: 'cancelled' }), ctx())

      expect(res.status).toBe(200)
      expect(updates[0]).toMatchObject({ status: 'cancelled' })
      expect(updates[1]).toHaveProperty('stockQty')
      expect(revalidateTag).toHaveBeenCalledWith('products')
    },
  )

  it('keeps the hold when a slip is rejected', async () => {
    // The order is still alive, with a fresh 24 hours to upload again.
    selects = [[ORDER], [WALLET], [CUSTOMER]]
    const res = await PATCH(request({ status: 'pending_payment', reason: 'The amount on the slip does not match the order total.' }), ctx())
    expect(res.status).toBe(200)
    expect(updates).toHaveLength(1)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it.each([false, true])('a notes-only edit on a confirmed order (reserved=%s) moves nothing', async (stockReserved) => {
    selects = [[{ ...ORDER, status: 'confirmed', stockReserved }], [WALLET], [CUSTOMER]]

    const res = await PATCH(request({ status: 'confirmed', notes: 'Courier booked.' }), ctx())

    expect(res.status).toBe(200)
    expect(updates).toEqual([{ status: 'confirmed', notes: 'Courier booked.' }])
    expect(sendMail).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/v1/admin/orders/[id] on an order placed before checkout reserved stock', () => {
  const UNRESERVED = { ...ORDER, stockReserved: false }

  it('still returns stock when one confirmed back then is cancelled', async () => {
    // It took its stock at confirm under the old rule, so the stock is out.
    selects = [[{ ...UNRESERVED, status: 'confirmed' }], [WALLET], [CUSTOMER]]
    txSelects = [[ITEM]]

    await PATCH(request({ status: 'cancelled' }), ctx())

    expect(updates[1]).toHaveProperty('stockQty')
  })

  it.each(['pending_payment', 'payment_submitted'] as const)(
    'refuses to confirm one still in %s, which holds no stock',
    async (status) => {
      // None should exist; a hand-edited or restored row could. Confirming it
      // would sell stock never set aside, and a later cancel would add stock
      // that was never taken.
      const cod = { id: 'cod', name: 'Cash on Delivery', kind: 'cod' }
      const method = status === 'pending_payment' ? cod : WALLET
      selects = [[{ ...UNRESERVED, status, paymentMethodId: method.id }], [method], [CUSTOMER]]

      const res = await PATCH(request({ status: 'confirmed' }), ctx())

      expect(res.status).toBe(409)
      expect(updates).toHaveLength(0)
      expect(sendMail).not.toHaveBeenCalled()
    },
  )
})

describe('PATCH /api/v1/admin/orders/[id] sending a slip back', () => {
  const REASON = 'The amount on the slip does not match the order total. You sent 30,000.'

  it('needs a reason, and changes nothing without one', async () => {
    for (const body of [{ status: 'pending_payment' }, { status: 'pending_payment', reason: '   ' }]) {
      selects = [[ORDER], [WALLET], [CUSTOMER]]
      const res = await PATCH(request(body), ctx())
      expect(res.status).toBe(400)
    }
    expect(updates).toHaveLength(0)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('refuses a reason over 500 characters', async () => {
    selects = [[ORDER], [WALLET], [CUSTOMER]]
    expect((await PATCH(request({ status: 'pending_payment', reason: 'x'.repeat(501) }), ctx())).status).toBe(400)
  })

  it('stores the reason, and re-arms the reminder for the new deadline', async () => {
    selects = [[ORDER], [WALLET], [CUSTOMER]]
    await PATCH(request({ status: 'pending_payment', reason: REASON }), ctx())
    expect(updates.at(-1)).toMatchObject({
      status: 'pending_payment',
      paymentRejectionReason: REASON,
      paymentReminderSentAt: null,
      expiresAt: expect.any(Date),
    })
  })

  it('emails the customer the reason and the new deadline', async () => {
    selects = [[ORDER], [WALLET], [CUSTOMER]]
    await PATCH(request({ status: 'pending_payment', reason: REASON }), ctx())
    expect(subjects()).toEqual([expect.stringContaining('slip sent back')])
    expect(rejectedProps).toMatchObject({ reason: REASON, total: 'Ks 33,000', method: 'KBZPay' })
    expect(rejectedProps?.deadline).toEqual(expect.any(String))
  })

  it('still sends the slip back when the email fails', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp down'))
    selects = [[ORDER], [WALLET], [CUSTOMER]]
    expect((await PATCH(request({ status: 'pending_payment', reason: REASON }), ctx())).status).toBe(200)
  })

  it('writes a reason only when sending a slip back', async () => {
    commitSelects()
    await PATCH(request({ status: 'confirmed', reason: REASON }), ctx())
    expect(updates.at(-1)).not.toHaveProperty('paymentRejectionReason')
  })

  it('clears the reason when the owner marks a slip submitted by hand', async () => {
    selects = [[{ ...ORDER, status: 'pending_payment' }], [WALLET], [CUSTOMER]]
    await PATCH(request({ status: 'payment_submitted' }), ctx())
    expect(updates.at(-1)).toMatchObject({ status: 'payment_submitted', paymentRejectionReason: null })
  })
})
