import { describe, expect, it } from 'vitest'
import { isLowStock, rankForShowcase, sortForGrid } from './merchandising'
import type { Product } from './types'

function product(name: string, over: Partial<Product> = {}): Product {
  return {
    id: name,
    slug: name,
    name,
    category: 'mice',
    price: 100_000,
    salePrice: null,
    tagline: '',
    description: '',
    specs: [],
    swatch: '#000',
    inStock: true,
    hasPhotos: false,
    stockQty: 10,
    lowStockThreshold: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const names = (list: readonly Product[]) => list.map((p) => p.name)

describe('isLowStock', () => {
  it('is true at or below the product threshold', () => {
    expect(isLowStock(product('a', { stockQty: 3, lowStockThreshold: 3 }))).toBe(true)
    expect(isLowStock(product('a', { stockQty: 1, lowStockThreshold: 3 }))).toBe(true)
  })

  it('is false above the threshold', () => {
    expect(isLowStock(product('a', { stockQty: 4, lowStockThreshold: 3 }))).toBe(false)
  })

  it('is false when sold out, which is a different state', () => {
    expect(isLowStock(product('a', { stockQty: 0 }))).toBe(false)
  })

  it('defaults the threshold to 3 when the product does not set one', () => {
    expect(isLowStock(product('a', { stockQty: 3, lowStockThreshold: undefined }))).toBe(true)
    expect(isLowStock(product('a', { stockQty: 4, lowStockThreshold: undefined }))).toBe(false)
  })

  it('falls back to the card fallback when stockQty is absent', () => {
    expect(isLowStock(product('a', { stockQty: undefined, inStock: true }))).toBe(false)
    expect(isLowStock(product('a', { stockQty: undefined, inStock: false }))).toBe(false)
  })
})

describe('rankForShowcase', () => {
  it('returns an empty list for no products', () => {
    expect(rankForShowcase([])).toEqual([])
  })

  it('does not mutate its input', () => {
    const input = [product('b'), product('a')]
    const before = names(input)
    rankForShowcase(input)
    expect(names(input)).toEqual(before)
  })

  it('puts sale items first, then low stock, then the rest', () => {
    const plain = product('plain')
    const low = product('low', { stockQty: 2 })
    const sale = product('sale', { salePrice: 90_000 })
    expect(names(rankForShowcase([plain, low, sale]))).toEqual(['sale', 'low', 'plain'])
  })

  it('orders sale items by deepest discount first', () => {
    const small = product('small', { salePrice: 90_000 })
    const big = product('big', { salePrice: 40_000 })
    const mid = product('mid', { salePrice: 70_000 })
    expect(names(rankForShowcase([small, big, mid]))).toEqual(['big', 'mid', 'small'])
  })

  it('keeps a low-stock sale item in the sale tier, ranked by discount', () => {
    const deep = product('deep', { salePrice: 40_000, stockQty: 10 })
    const scarce = product('scarce', { salePrice: 95_000, stockQty: 1 })
    expect(names(rankForShowcase([scarce, deep]))).toEqual(['deep', 'scarce'])
  })

  it('orders low-stock items by fewest units left', () => {
    const two = product('two', { stockQty: 2 })
    const one = product('one', { stockQty: 1 })
    const three = product('three', { stockQty: 3 })
    expect(names(rankForShowcase([two, three, one]))).toEqual(['one', 'two', 'three'])
  })

  it('drops sold-out products entirely', () => {
    const gone = product('gone', { stockQty: 0, inStock: false, salePrice: 10_000 })
    const here = product('here')
    expect(names(rankForShowcase([gone, here]))).toEqual(['here'])
  })

  it('breaks ties on featured, then sortOrder, then name', () => {
    const plain = product('plain', { sortOrder: 1 })
    const starred = product('starred', { featured: true, sortOrder: 9 })
    expect(names(rankForShowcase([plain, starred]))).toEqual(['starred', 'plain'])

    const second = product('second', { sortOrder: 2 })
    const first = product('first', { sortOrder: 1 })
    expect(names(rankForShowcase([second, first]))).toEqual(['first', 'second'])

    const bravo = product('bravo')
    const alpha = product('alpha')
    expect(names(rankForShowcase([bravo, alpha]))).toEqual(['alpha', 'bravo'])
  })

  it('applies the tiebreak inside the sale tier for equal discounts', () => {
    const plain = product('plain', { salePrice: 90_000, stockQty: 1 })
    const starred = product('starred', { salePrice: 90_000, featured: true, stockQty: 10 })
    expect(names(rankForShowcase([plain, starred]))).toEqual(['starred', 'plain'])
  })

  it('treats a missing sortOrder as 0 rather than dropping the product', () => {
    const none = product('none', { sortOrder: undefined })
    const later = product('later', { sortOrder: 5 })
    expect(names(rankForShowcase([later, none]))).toEqual(['none', 'later'])
  })
})

describe('sortForGrid', () => {
  const grid = [
    product('Cobalt', { price: 300_000, stockQty: 0, inStock: false, featured: true }),
    product('Amber', { price: 200_000 }),
    product('Basalt', { price: 100_000, stockQty: 0, inStock: false }),
    product('Dune', { price: 400_000, salePrice: 50_000, featured: true }),
  ]

  it.each([
    ['featured', ['Dune', 'Amber', 'Cobalt', 'Basalt']],
    ['price-asc', ['Dune', 'Amber', 'Basalt', 'Cobalt']],
    ['price-desc', ['Amber', 'Dune', 'Cobalt', 'Basalt']],
    ['name-asc', ['Amber', 'Dune', 'Basalt', 'Cobalt']],
  ] as const)('puts sold-out products last when sorting by %s', (sort, expected) => {
    // What a shopper can buy comes first; within each group the chosen sort holds.
    expect(names(sortForGrid(grid, sort))).toEqual(expected)
  })

  it('sorts by what the card shows, so a sale price counts', () => {
    expect(names(sortForGrid(grid, 'price-asc'))[0]).toBe('Dune')
  })

  it('leaves the list it was given untouched', () => {
    const before = names(grid)
    sortForGrid(grid, 'name-asc')
    expect(names(grid)).toEqual(before)
  })
})

describe('sortForGrid edge cases', () => {
  it('keeps the incoming order between products the sort cannot tell apart', () => {
    const same = [product('Zed'), product('Ash'), product('Moss')]
    expect(names(sortForGrid(same, 'featured'))).toEqual(['Zed', 'Ash', 'Moss'])
  })

  it('handles a grid that is all sold out, or empty', () => {
    const gone = [product('B', { stockQty: 0 }), product('A', { stockQty: 0 })]
    expect(names(sortForGrid(gone, 'name-asc'))).toEqual(['A', 'B'])
    expect(sortForGrid([], 'featured')).toEqual([])
  })

  it('reads sold out from the in-stock flag when no count is known', () => {
    const list = [product('Gone', { stockQty: undefined, inStock: false }), product('Here')]
    expect(names(sortForGrid(list, 'name-asc'))).toEqual(['Here', 'Gone'])
  })
})

describe('sortForGrid by price, for a sold-out product on sale', () => {
  it('sorts it by the full price it shows, not a sale nobody can take', () => {
    // Sold-out products sink below the rest, so the order shows among them.
    const keychron = product('keychron', { price: 545_000, salePrice: 200_000, stockQty: 0, inStock: false })
    const mouse = product('mouse', { price: 300_000, stockQty: 0, inStock: false })
    expect(names(sortForGrid([keychron, mouse], 'price-asc'))).toEqual(['mouse', 'keychron'])
  })
})

