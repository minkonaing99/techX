import { describe, expect, it, vi } from 'vitest'
import { orders } from '@/db/schema/orders'

let rows: { productId: string; held: string | null }[] = []
const wheres: unknown[] = []

vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: (...conds: unknown[]) => ({ and: conds }),
  eq: (col: unknown, value: unknown) => ({ eq: [col, value] }),
  inArray: (col: unknown, values: unknown) => ({ inArray: [col, values] }),
}))

vi.mock('@/db', () => {
  const q = {
    from: () => q,
    innerJoin: () => q,
    where: (cond: unknown) => {
      wheres.push(cond)
      return q
    },
    groupBy: () => Promise.resolve(rows),
  }
  return { db: { select: () => q } }
})

const { heldByProduct } = await import('./held-stock')

describe('heldByProduct', () => {
  it('counts only unpaid orders that reserved stock', async () => {
    // Confirmed orders are left out: their stock is gone for good under either rule.
    rows = []
    await heldByProduct()
    expect(wheres.at(-1)).toEqual({
      and: [
        { eq: [orders.stockReserved, true] },
        { inArray: [orders.status, ['pending_payment', 'payment_submitted']] },
      ],
    })
  })

  it('turns the database sums, which arrive as strings, into numbers by product', async () => {
    rows = [
      { productId: 'kestrel-75', held: '3' },
      { productId: 'wren-65', held: null },
    ]
    expect(await heldByProduct()).toEqual({ 'kestrel-75': 3, 'wren-65': 0 })
  })
})
