import { describe, expect, it } from 'vitest'
import { filterCounts, filterRows, NO_FILTER, type FilterRow } from './product-filters'

function row(id: string, over: Partial<FilterRow> = {}): FilterRow {
  return {
    id,
    categoryId: 'mice',
    stockQty: 10,
    lowStockThreshold: 3,
    isActive: true,
    hasPhotos: true,
    ...over,
  }
}

const ROWS = [
  row('a', { categoryId: 'keyboards' }),
  row('b', { stockQty: 2 }),
  row('c', { categoryId: 'accessories', isActive: false, hasPhotos: false }),
  row('d', { categoryId: 'keyboards', stockQty: 0 }),
]

const ids = (rows: FilterRow[]) => rows.map((r) => r.id)

describe('filterRows', () => {
  it('returns every row with no filter', () => {
    expect(ids(filterRows(ROWS, NO_FILTER))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('narrows to one category', () => {
    expect(ids(filterRows(ROWS, { ...NO_FILTER, category: 'keyboards' }))).toEqual(['a', 'd'])
  })

  it.each([
    ['hidden', ['c']],
    ['noPhotos', ['c']],
    ['lowStock', ['b', 'd']],
  ] as const)('needs-work %s', (flag, expected) => {
    expect(ids(filterRows(ROWS, { ...NO_FILTER, flag }))).toEqual(expected)
  })

  it('combines category and needs-work', () => {
    expect(ids(filterRows(ROWS, { category: 'keyboards', flag: 'lowStock' }))).toEqual(['d'])
  })

  it('has no search part', () => {
    expect(NO_FILTER).toEqual({ category: '', flag: null })
  })

  it('keeps an open row even when it stops matching', () => {
    expect(ids(filterRows(ROWS, { ...NO_FILTER, flag: 'noPhotos' }, new Set(['a'])))).toEqual(['a', 'c'])
  })
})

describe('lowStock', () => {
  it('counts stock at the threshold and sold out with a zero threshold', () => {
    const rows = [row('at', { stockQty: 3, lowStockThreshold: 3 }), row('zero', { stockQty: 0, lowStockThreshold: 0 }), row('ok', { stockQty: 4 })]
    expect(ids(filterRows(rows, { ...NO_FILTER, flag: 'lowStock' }))).toEqual(['at', 'zero'])
  })
})

describe('filterCounts', () => {
  it('shows a product in a category the shop does not have under All only', () => {
    const c = filterCounts([row('x', { categoryId: 'chairs' })])
    expect(c.all).toBe(1)
    expect(Object.values(c.categories).reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('counts every category and needs-work rule over the whole list', () => {
    const c = filterCounts(ROWS)
    expect(c.all).toBe(4)
    expect(c.categories).toMatchObject({ keyboards: 2, mice: 1, accessories: 1, monitors: 0 })
    expect(c.flags).toEqual({ hidden: 1, noPhotos: 1, lowStock: 2 })
  })
})
