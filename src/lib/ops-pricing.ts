import { isValidSalePrice, salePriceMessage } from '@/lib/pricing'

/*
 * Price rules for the owner's ops API (docs/MCP-OPS.md, "Rules"). Pure: the
 * routes read and write, this decides.
 */

export const ROUND_STEPS = [100, 500, 1000] as const
export type RoundStep = (typeof ROUND_STEPS)[number]

/** One reprice may move prices this far. Wide enough for a devaluation, narrow enough to catch 80 for 8. */
export const PERCENT_MIN = -50
export const PERCENT_MAX = 100

/** The admin schema's ceiling, kept here so ops writes cannot pass it. */
export const MAX_PRICE_MMK = 999_999_999

export interface RepriceProduct {
  id: string
  name: string
  categoryId: string
  priceMmk: number
  salePriceMmk: number | null
  isActive: boolean
}

export interface PriceChange {
  id: string
  priceWas: number
  salePriceWas: number | null
  priceMmk: number
  salePriceMmk: number | null
}

export interface PlannedChange extends PriceChange {
  name: string
}

export interface BlockedProduct {
  id: string
  name: string
  reason: string
}

export interface RepricePlan {
  changes: PlannedChange[]
  blocked: BlockedProduct[]
}

export interface RepriceOptions {
  percent: number
  roundTo: RoundStep
  category?: string
  includeInactive?: boolean
}

/**
 * `price` moved by `bp` basis points and rounded to the nearest `roundTo`.
 * Whole numbers throughout: the largest product, 999,999,999 x 20,000, stays
 * well inside exact integer range, and floats would turn 1,000 x 1.1 into
 * 1,100.0000000000002.
 */
export function scalePrice(price: number, bp: number, roundTo: number): number {
  return Math.round((price * (10_000 + bp)) / (10_000 * roundTo)) * roundTo
}

function blockReason(price: number, sale: number | null, saleWas: number | null, roundTo: number): string | null {
  if (price < roundTo) return `price would fall below Ks ${roundTo}`
  if (price > MAX_PRICE_MMK) return 'price would go above Ks 999,999,999'
  if (sale !== null && sale >= price) return 'sale price would no longer be below the price'
  // Checkout charges the sale price, so a sale rounded to 0 would sell for nothing.
  if (sale === 0 && saleWas !== null && saleWas > 0) return 'sale price would round to 0'
  return null
}

/**
 * Every change a reprice would make, or why it cannot run. All or nothing: if
 * any product is blocked the caller must not apply the rest - in an inflation
 * a partial run quietly leaves some products at the old price. Products priced
 * at 0 are left alone; products whose price would not move are left out.
 */
export function planReprice(products: readonly RepriceProduct[], opts: RepriceOptions): RepricePlan {
  const bp = Math.round(opts.percent * 100)
  const changes: PlannedChange[] = []
  const blocked: BlockedProduct[] = []

  const scope = products
    .filter((p) => p.priceMmk > 0)
    .filter((p) => !opts.category || p.categoryId === opts.category)
    .filter((p) => opts.includeInactive !== false || p.isActive)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  for (const p of scope) {
    const priceMmk = scalePrice(p.priceMmk, bp, opts.roundTo)
    const salePriceMmk = p.salePriceMmk === null ? null : scalePrice(p.salePriceMmk, bp, opts.roundTo)
    const reason = blockReason(priceMmk, salePriceMmk, p.salePriceMmk, opts.roundTo)
    if (reason) {
      blocked.push({ id: p.id, name: p.name, reason })
      continue
    }
    if (priceMmk === p.priceMmk && salePriceMmk === p.salePriceMmk) continue
    changes.push({ id: p.id, name: p.name, priceWas: p.priceMmk, salePriceWas: p.salePriceMmk, priceMmk, salePriceMmk })
  }
  return { changes, blocked }
}

/** Why a single price change may not be written, or null. The sale rule shares admin's wording. */
export function changeProblem(change: PriceChange): string | null {
  if (!Number.isInteger(change.priceMmk) || change.priceMmk < 1) return `${change.id}: price must be at least 1 Ks.`
  if (change.priceMmk > MAX_PRICE_MMK) return `${change.id}: price must be at most Ks 999,999,999.`
  // Stricter than admin on purpose: through ops one typo and one approval would
  // make a product free. An existing 0 sale may stay.
  if (change.salePriceMmk === 0 && change.salePriceWas !== 0) {
    return `${change.id}: a sale price must be at least 1 Ks (use null to end the sale).`
  }
  if (!isValidSalePrice(change.priceMmk, change.salePriceMmk)) {
    return `${change.id}: ${salePriceMessage(change.priceMmk, change.salePriceMmk)}`
  }
  return null
}
