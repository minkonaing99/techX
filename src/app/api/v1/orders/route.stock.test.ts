import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBuckets } from '@/lib/rate-limit'
import { orders } from '@/db/schema/orders'
import { products } from '@/db/schema/products'
import { users } from '@/db/schema/auth'

/*
 * Checkout reserving stock. Kept apart from route.test.ts, which covers
 * pricing and validation and is long enough already.
 */

const ADDRESS_ID = '3aa6e85b-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

interface CartLine {
  productId: string
  qty: number
  product: { name: string; priceMmk: number; salePriceMmk: null; stockQty: number; isActive: boolean }
}

let selects: unknown[][] = []
let cartLines: CartLine[] = []
/** Cart as re-read after a refused checkout, when stock has moved. */
let cartAfterRefusal: CartLine[] | null = null
let getCartCalls = 0
/** `affectedRows` for each stock decrement, in order. Defaults to 1. */
let stockAffects: number[] = []
/** Rows the low-stock read returns after each decrement. */
let lowReads: unknown[][] = []
/** Orders already holding stock, as the in-transaction count reports it. */
let openOrders = 0
/** Every `.where()` a transaction read used, and which reads asked for a row lock. */
let txReadWheres: unknown[] = []
let lockedReads: unknown[] = []
/** The product ids stock was taken from, in order. */
let taken: unknown[] = []
let cartDeleteAffects = 1
let inserts: [unknown, Record<string, unknown>][] = []
let txLog: string[] = []

const { sendMail, sendTelegram, revalidateTag } = vi.hoisted(() => ({
  sendMail: vi.fn<(p: { to: string; subject: string }) => Promise<{ delivered: boolean }>>(),
  sendTelegram: vi.fn(async () => {}),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1', email: 'buyer@example.com' } }) }))
vi.mock('@/lib/cart-session', () => ({
  getCart: async () => {
    getCartCalls += 1
    return { cartId: 'cart-u1', lines: getCartCalls > 1 && cartAfterRefusal ? cartAfterRefusal : cartLines }
  },
}))
vi.mock('@/lib/mail', () => ({ sendMail }))
vi.mock('@/lib/telegram', () => ({ sendTelegram }))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('@emails/new-order-alert', () => ({ NewOrderAlert: () => null }))
vi.mock('@emails/order-placed', () => ({ OrderPlaced: () => null }))
vi.mock('@emails/low-stock-alert', () => ({ LowStockAlert: () => null }))

// Conditions are reduced to plain records so a test can read them.
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
      where: () => c,
      limit: () => c,
      orderBy: () => c,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    }
    return c
  }
  const tx = {
    delete: () => ({
      where: async () => {
        txLog.push('delete')
        return [{ affectedRows: cartDeleteAffects }, []]
      },
    }),
    update: () => ({
      set: () => ({
        // mysql2 hands back [ResultSetHeader, FieldPacket[]].
        where: async (cond: { and?: { eq?: unknown[] }[] }) => {
          txLog.push('take')
          taken.push(cond.and?.[0]?.eq?.[1])
          return [{ affectedRows: stockAffects.shift() ?? 1 }, []]
        },
      }),
    }),
    // In order: the customer's row (locked), the held-order count, then one
    // low-stock read per line taken.
    select: () => {
      let readNo = 0
      let where: unknown
      const q: Record<string, unknown> = {
        from: () => q,
        limit: () => q,
        where: (cond: unknown) => {
          where = cond
          txReadWheres.push(cond)
          return q
        },
        for: (mode: string) => {
          if (mode === 'update') lockedReads.push(where)
          return q
        },
        then: (resolve: (v: unknown) => unknown) => {
          readNo = txReadWheres.length
          const result =
            readNo === 1 ? [{ id: 'u1' }] : readNo === 2 ? [{ open: openOrders }] : (lowReads.shift() ?? [])
          return Promise.resolve(result).then(resolve)
        },
      }
      return q
    },
    insert: (table: unknown) => ({
      values: async (v: Record<string, unknown>) => {
        txLog.push('insert')
        inserts.push([table, v])
      },
    }),
  }
  return {
    db: {
      select: () => chain(() => selects.shift() ?? []),
      transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
    },
  }
})

const { POST } = await import('./route')

const SAVED_ADDRESS = {
  id: ADDRESS_ID,
  userId: 'u1',
  divisionId: 'yangon',
  recipient: 'Aung Aung',
  phone: '+959123456789',
  telegramUsername: null,
  city: 'Yangon',
  township: 'Kamayut',
  street: '12 Pyay Road',
  landmark: null,
  mapsUrl: null,
}
const YANGON = { id: 'yangon', name: 'Yangon', deliveryFeeMmk: 3000, codAllowed: true, isBlocked: false }
const WALLET = {
  id: 'kbz',
  name: 'KBZPay',
  kind: 'wallet',
  isActive: true,
  accountName: 'TechX',
  accountPhone: '0123456789',
  qrImageUrl: null,
}

function line(productId: string, qty: number, stockQty = 10): CartLine {
  return {
    productId,
    qty,
    product: { name: productId === 'p1' ? 'Signet' : 'Wren', priceMmk: 15_000, salePriceMmk: null, stockQty, isActive: true },
  }
}

let ip = 0
function place(): Promise<Response> {
  ip += 1
  return POST(
    new Request('http://localhost/api/v1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.6.0.${ip}` },
      body: JSON.stringify({ shippingAddressId: ADDRESS_ID, paymentMethodId: 'kbz' }),
    }),
  )
}

/** Address, division and payment method; the held-order count is read in the transaction. */
function readsFor(open = 0) {
  selects = [[SAVED_ADDRESS], [YANGON], [WALLET]]
  openOrders = open
}

beforeEach(() => {
  readsFor()
  cartLines = [line('p1', 2)]
  cartAfterRefusal = null
  getCartCalls = 0
  stockAffects = []
  lowReads = []
  txReadWheres = []
  lockedReads = []
  taken = []
  cartDeleteAffects = 1
  inserts = []
  txLog = []
  sendMail.mockReset()
  sendMail.mockResolvedValue({ delivered: true })
  sendTelegram.mockClear()
  revalidateTag.mockClear()
  resetBuckets()
})

describe('POST /api/v1/orders reserving stock', () => {
  it('takes the stock after emptying the cart and before writing the order', async () => {
    cartLines = [line('p2', 1), line('p1', 2)]
    const res = await place()
    expect(res.status).toBe(200)
    expect(txLog).toEqual(['delete', 'take', 'take', 'insert', 'insert'])
  })

  it('marks the order as holding its stock', async () => {
    await place()
    const order = inserts.find(([t]) => t === orders)?.[1]
    expect(order).toMatchObject({ stockReserved: true })
  })

  it('refreshes the catalog once the stock is taken', async () => {
    await place()
    expect(revalidateTag).toHaveBeenCalledWith('products')
  })

  it('refuses the order, writing nothing, when another checkout took the stock first', async () => {
    // The snapshot check passed, but by the time this transaction took stock
    // the last units were gone. The re-read cart says how many are left.
    stockAffects = [0]
    cartAfterRefusal = [line('p1', 2, 1)]

    const res = await place()

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('CART_UNORDERABLE')
    expect(body.error.message).toBe('Only 1 of Signet left.')
    expect(inserts).toHaveLength(0)
    expect(sendMail).not.toHaveBeenCalled()
    expect(sendTelegram).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('still refuses with a sentence when the re-read finds the cart fine again', async () => {
    stockAffects = [0]
    const res = await place()
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('CART_UNORDERABLE')
    expect(body.error.message).toBe('An item in your cart just sold out. Review your cart and try again.')
  })

  it('takes no stock for a cart another request already ordered', async () => {
    cartDeleteAffects = 0
    expect((await place()).status).toBe(409)
    expect(txLog).toEqual(['delete'])
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('takes stock in product-id order whatever order the cart lists it in', async () => {
    cartLines = [line('p2', 1), line('p1', 2)]
    await place()
    expect(taken).toEqual(['p1', 'p2'])
  })

  it('writes nothing and alerts no one when the second line runs out', async () => {
    cartLines = [line('p1', 2), line('p2', 1)]
    stockAffects = [1, 0]
    lowReads = [[{ name: 'Signet', stockQty: 1, threshold: 3 }]]

    expect((await place()).status).toBe(409)

    expect(inserts).toHaveLength(0)
    expect(sendMail).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('tells the owner when the order takes a product to its low-stock threshold', async () => {
    vi.stubEnv('EMAIL_FROM', 'TechX <owner@example.com>')
    lowReads = [[{ name: 'Signet', stockQty: 2, threshold: 3 }]]
    await place()
    expect(sendMail.mock.calls.map(([p]) => p.subject)).toContain('Low stock: Signet')
  })
})

describe('POST /api/v1/orders open-order cap', () => {
  it('refuses a fourth order while three are holding stock', async () => {
    // Each open order holds its stock for up to a day, so one account could
    // otherwise park the last units of everything.
    readsFor(3)
    const res = await place()
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('TOO_MANY_OPEN_ORDERS')
    expect(inserts).toHaveLength(0)
    expect(taken).toHaveLength(0)
  })

  it("counts only the caller's own orders that hold stock", async () => {
    // A slip awaiting review, or an order placed before reservation, holds
    // nothing the cap needs to bound.
    await place()
    expect(txReadWheres[1]).toEqual({
      and: [
        { eq: [orders.userId, 'u1'] },
        { eq: [orders.stockReserved, true] },
        { inArray: [orders.status, ['pending_payment', 'payment_submitted']] },
      ],
    })
  })

  it("counts under a lock on the customer's row, so two checkouts cannot both slip under the cap", async () => {
    await place()
    expect(lockedReads).toEqual([{ eq: [users.id, 'u1'] }])
  })

  it('accepts a third', async () => {
    readsFor(2)
    expect((await place()).status).toBe(200)
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// Keeps the products import honest: the take guard is on products.id.
void products
