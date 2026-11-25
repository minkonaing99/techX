/**
 * What the homepage pushes, and in what order. Kept apart from `catalog.ts` so
 * the rule is a pure sort over already-loaded products - no DB, no cache, and
 * testable without rendering a page.
 */
import { discountPercent, effectiveUnitPrice, isOnSale, shownSalePrice } from './pricing'
import type { Product } from './types'

/** The card's own fallback, repeated here so rank and badge cannot disagree. */
function qty(p: Product): number {
  return p.stockQty ?? (p.inStock ? 10 : 0)
}

/** The predicate behind the "Only N left" badge, and behind the second tier. */
export function isLowStock(p: Product): boolean {
  const q = qty(p)
  return q > 0 && q <= (p.lowStockThreshold ?? 3)
}

function tier(p: Product): number {
  if (isOnSale(p.price, p.salePrice)) return 0
  if (isLowStock(p)) return 1
  return 2
}

/**
 * `featured` is a tiebreak, not a gate: a stale checkbox in admin should not
 * outrank a product that is actually discounted today.
 */
function tiebreak(a: Product, b: Product): number {
  return (
    Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    a.name.localeCompare(b.name)
  )
}

/**
 * Sale first by depth of discount, then scarcity by units left, then the rest.
 * Sold-out products are dropped rather than sunk - the section exists to sell.
 */
export function rankForShowcase(products: readonly Product[]): readonly Product[] {
  return [...products]
    .filter((p) => qty(p) > 0)
    .sort((a, b) => {
      const byTier = tier(a) - tier(b)
      if (byTier !== 0) return byTier
      if (tier(a) === 0) {
        const byDiscount =
          discountPercent(b.price, b.salePrice) - discountPercent(a.price, a.salePrice)
        return byDiscount || tiebreak(a, b)
      }
      if (tier(a) === 1) return qty(a) - qty(b) || tiebreak(a, b)
      return tiebreak(a, b)
    })
}

export type GridSort = 'featured' | 'price-asc' | 'price-desc' | 'name-asc'

/** Sorts on what the card shows, so a discounted product sits where its sale price puts it. */
function paid(p: Product): number {
  return effectiveUnitPrice(p.price, shownSalePrice(p))
}

const GRID_ORDER: Record<GridSort, (a: Product, b: Product) => number> = {
  featured: (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)),
  'price-asc': (a, b) => paid(a) - paid(b),
  'price-desc': (a, b) => paid(b) - paid(a),
  'name-asc': (a, b) => a.name.localeCompare(b.name),
}

/**
 * The shop grid's order. Sold-out products go to the end whatever the sort,
 * so the first screen is things a shopper can buy; the chosen order holds
 * within each group.
 */
export function sortForGrid(products: readonly Product[], sort: GridSort): Product[] {
  const order = GRID_ORDER[sort]
  return [...products].sort((a, b) => Number(qty(a) <= 0) - Number(qty(b) <= 0) || order(a, b))
}
