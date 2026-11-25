import { beforeEach, describe, expect, it, vi } from 'vitest'
import { orderItems, orders } from '@/db/schema/orders'
import { paymentMethods } from '@/db/schema/payment-methods'

/** One result per `db.select()`, in order. */
let selects: unknown[][] = []
let selectCalls = 0
/** Every `.where()` condition, in call order. */
let wheres: unknown[] = []

vi.mock('server-only', () => ({}))
// Conditions reduced to plain records, so a test can read each filter.
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: (...conds: unknown[]) => ({ and: conds }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  gte: (a: unknown, b: unknown) => ({ gte: [a, b] }),
  lt: (a: unknown, b: unknown) => ({ lt: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ inArray: [a, b] }),
}))
vi.mock('@/db', () => {
  function chain(result: unknown) {
    const c: Record<string, unknown> = {
      from: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      where: (cond: unknown) => {
        wheres.push(cond)
        return c
      },
      orderBy: () => c,
      then: (resolve: (v: unknown) => unknown) => resolve(result),
    }
    return c
  }
  return {
    db: {
      select: () => {
        selectCalls += 1
        return chain(selects.shift() ?? [])
      },
    },
  }
})

const { getOrdersForExport, getSalesReport } = await import('./admin-sales')

beforeEach(() => {
  selects = []
  selectCalls = 0
  wheres = []
})

const START = new Date('2026-09-30T17:30:00Z')
const END = new Date('2026-10-23T17:30:00Z')

describe('getOrdersForExport', () => {
  it('skips the items read when the range has no orders', async () => {
    expect(await getOrdersForExport(START, END)).toEqual([])
    expect(selectCalls).toBe(1)
  })

  it('reads every status placed in [start, end), and only those orders\' items', async () => {
    selects = [[{ id: 'o1', totalMmk: 1, subtotalMmk: 1, deliveryFeeMmk: 0 }], []]
    await getOrdersForExport(START, END)
    expect(wheres).toEqual([
      { and: [{ gte: [orders.placedAt, START] }, { lt: [orders.placedAt, END] }] },
      { inArray: [orderItems.orderId, ['o1']] },
    ])
  })

  it('lists each order with its items as "2x Name; 1x Name" and money as numbers', async () => {
    selects = [
      [
        { id: 'o1', totalMmk: '548000', subtotalMmk: '545000', deliveryFeeMmk: '3000' },
        { id: 'o2', totalMmk: '10', subtotalMmk: '10', deliveryFeeMmk: '0' },
      ],
      [
        { orderId: 'o1', qty: 2, name: 'K2 Pro' },
        { orderId: 'o1', qty: 1, name: 'Wren 65' },
        { orderId: 'o2', qty: 1, name: 'Mouse' },
      ],
    ]
    const rows = await getOrdersForExport(START, END)
    expect(rows[0]).toMatchObject({ items: '2x K2 Pro; 1x Wren 65', totalMmk: 548_000, deliveryFeeMmk: 3_000 })
    expect(rows[1]!.items).toBe('1x Mouse')
  })
})

describe('getSalesReport', () => {
  it('filters each read the way the sums assume', async () => {
    const now = new Date('2026-10-23T05:00:00Z')
    selects = [[], [{ orders: 0, totalMmk: null }], []]
    await getSalesReport(now)
    const sold = { inArray: [orders.status, ['confirmed', 'delivered']] }
    expect(wheres).toEqual([
      // Revenue: sold orders from the earlier of the 30-day and month starts.
      { and: [sold, { gte: [orders.placedAt, new Date('2026-09-23T17:30:00Z')] }] },
      // COD to collect: confirmed cash-on-delivery orders, any age.
      { and: [{ eq: [orders.status, 'confirmed'] }, { eq: [paymentMethods.kind, 'cod'] }] },
      // Top products: sold orders in the last 30 days.
      { and: [sold, { gte: [orders.placedAt, new Date('2026-09-23T17:30:00Z')] }] },
    ])
  })

  it('turns the three reads into one report', async () => {
    const now = new Date('2026-10-23T05:00:00Z')
    selects = [
      [{ totalMmk: '548000', placedAt: new Date('2026-10-23T01:00:00Z'), status: 'confirmed' }],
      [{ orders: 2, totalMmk: '120000' }],
      [{ productId: 'k2', nameSnapshot: 'K2 Pro', qty: 1, unitPriceMmkSnapshot: '545000', placedAt: new Date('2026-10-23T01:00:00Z') }],
    ]
    const report = await getSalesReport(now)
    expect(report).toMatchObject({ todayMmk: 548_000, orders30: 1, codToCollect: { orders: 2, totalMmk: 120_000 } })
    expect(report.top).toEqual([{ productId: 'k2', name: 'K2 Pro', units: 1, revenueMmk: 545_000 }])
    expect(report.daily).toHaveLength(30)
  })

  it('reports nothing to collect when there is no COD outstanding', async () => {
    selects = [[], [{ orders: 0, totalMmk: null }], []]
    expect((await getSalesReport()).codToCollect).toEqual({ orders: 0, totalMmk: 0 })
  })
})
