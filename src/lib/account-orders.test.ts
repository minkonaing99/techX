import { beforeEach, describe, expect, it, vi } from 'vitest'

/** One entry per select, in order: the orders, then their items. */
let selects: unknown[][] = []
let limits: number[] = []

vi.mock('@/db', () => {
  function chain(result: unknown) {
    const c: Record<string, unknown> = {
      from: () => c,
      innerJoin: () => c,
      where: () => c,
      orderBy: () => c,
      limit: (n: number) => {
        limits.push(n)
        return c
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    return c
  }
  return { db: { select: () => chain(selects.shift() ?? []) } }
})

const { ORDERS_SHOWN, itemsSummary, loadAccountOrders } = await import('./account-orders')

beforeEach(() => {
  selects = []
  limits = []
})

describe('itemsSummary', () => {
  it('names the first item, with its quantity when more than one', () => {
    expect(itemsSummary([{ name: 'Kestrel 75', qty: 1 }])).toBe('Kestrel 75')
    expect(itemsSummary([{ name: 'Kestrel 75', qty: 2 }])).toBe('2 × Kestrel 75')
  })

  it('counts the other lines', () => {
    const lines = [
      { name: 'Kestrel 75', qty: 1 },
      { name: 'Wren 65', qty: 1 },
      { name: 'Desk mat', qty: 3 },
    ]
    expect(itemsSummary(lines.slice(0, 2))).toBe('Kestrel 75 + 1 more')
    expect(itemsSummary(lines)).toBe('Kestrel 75 + 2 more')
  })

  it('says nothing for an order with no lines', () => {
    expect(itemsSummary([])).toBe('')
  })
})

describe('loadAccountOrders', () => {
  const ORDER = {
    id: '1742a6d4-0000-4000-8000-000000000000',
    status: 'confirmed',
    totalMmk: 605_000,
    placedAt: new Date('2026-10-25T08:00:00Z'),
    methodName: 'KBZ Pay',
    methodKind: 'wallet',
  }

  it('reads no items when there are no orders', async () => {
    selects = [[]]
    expect(await loadAccountOrders('u1')).toEqual([])
    expect(selects).toEqual([])
  })

  it('joins each order to its own items, in the order they were added', async () => {
    const other = { ...ORDER, id: 'ffad741a-0000-4000-8000-000000000000' }
    selects = [
      [ORDER, other],
      [
        { orderId: ORDER.id, name: 'Kestrel 75', qty: 1 },
        { orderId: other.id, name: 'Desk mat', qty: 2 },
        { orderId: ORDER.id, name: 'Wren 65', qty: 1 },
      ],
    ]
    const rows = await loadAccountOrders('u1')
    expect(rows.map((r) => [r.id, r.items])).toEqual([
      [ORDER.id, 'Kestrel 75 + 1 more'],
      [other.id, '2 × Desk mat'],
    ])
    expect(rows[0]).toMatchObject({ methodName: 'KBZ Pay', methodKind: 'wallet', totalMmk: 605_000, placedAt: ORDER.placedAt.toISOString() })
  })

  it('caps the full list at the most recent orders', async () => {
    selects = [[ORDER], []]
    await loadAccountOrders('u1')
    expect(limits).toEqual([ORDERS_SHOWN])
  })

  it('limits the list when asked, for the overview', async () => {
    selects = [[ORDER], []]
    await loadAccountOrders('u1', 3)
    expect(limits).toEqual([3])
  })
})
