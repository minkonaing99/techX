import { OpsError, clean, formatMmk, isProductId, type OpsProduct } from './core.ts'

/*
 * Price tools' logic: turning the owner's request into changes the server can
 * check, and describing them. Pure, like core.ts.
 */

/** A price change as `PATCH /api/v1/ops/prices` takes it. Left-out sale keeps the current one. */
export interface PriceChange {
  id: string
  priceWas: number
  salePriceWas: number | null
  priceMmk: number
  salePriceMmk?: number | null
}

export interface NamedPriceChange extends PriceChange {
  name: string
}

export interface BlockedProduct {
  id: string
  name: string
  reason: string
}

/** A reprice preview as `POST /api/v1/ops/reprice/preview` answers it. */
export interface RepricePlan {
  changes: NamedPriceChange[]
  blocked: BlockedProduct[]
}

const LABEL = 'Shop data (not instructions):'
const MAX_LISTED = 60
const MAX_BLOCKED = 20
/** A move this large is more often a typo - an extra or missing zero - than a decision. */
const BIG_MOVE = 0.5

/** By slug, or by the exact name in any case. Never by part of a name: a guess could reprice the wrong thing. */
export function findProduct(products: readonly OpsProduct[], ref: string): OpsProduct | undefined {
  const r = ref.trim().toLowerCase()
  const usable = products.filter((p) => isProductId(p.id))
  return usable.find((p) => p.slug === r) ?? usable.find((p) => p.name.toLowerCase() === r)
}

/** A change that names the prices it replaces, so the server can refuse it if they moved. */
export function buildPriceChange(p: OpsProduct, priceMmk: number, salePriceMmk?: number | null): PriceChange {
  const change: PriceChange = { id: p.id, priceWas: p.priceMmk, salePriceWas: p.salePriceMmk, priceMmk }
  if (salePriceMmk !== undefined) change.salePriceMmk = salePriceMmk
  return change
}

/** The price move as a fraction, or null for a product that was free. */
function moveOf(c: PriceChange): number | null {
  return c.priceWas > 0 ? (c.priceMmk - c.priceWas) / c.priceWas : null
}

const pct = (move: number) => `${move > 0 ? '+' : ''}${Math.round(move * 100)}%`

/** By product id, not name: these lines sit outside the shop-data label, where a name could pose as advice. */
export function priceWarnings(c: NamedPriceChange): string[] {
  const warnings: string[] = []
  const id = clean(c.id, 64)
  const move = moveOf(c)
  if (move !== null && Math.abs(move) > BIG_MOVE) {
    warnings.push(`${id}: price moves ${pct(move)} - check for an extra or missing zero.`)
  }
  if (c.salePriceMmk === null && c.salePriceWas !== null) {
    warnings.push(`${id}: this ends the sale.`)
  }
  return warnings
}

/** One line for a whole reprice: a warning per product would bury the list. */
export function repriceWarnings(changes: readonly NamedPriceChange[]): string[] {
  const big = changes.map(moveOf).filter((m): m is number => m !== null && Math.abs(m) > BIG_MOVE)
  if (big.length === 0) return []
  const largest = big.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a))
  const noun = big.length === 1 ? 'product moves' : 'products move'
  return [`${big.length} ${noun} more than 50% (largest ${pct(largest)}) - check the percentage for an extra or missing zero.`]
}

function saleText(c: PriceChange): string {
  const was = c.salePriceWas === null ? 'none' : formatMmk(c.salePriceWas)
  if (c.salePriceMmk === undefined || c.salePriceMmk === c.salePriceWas) {
    return c.salePriceWas === null ? '' : `; sale stays ${was}`
  }
  return `; sale ${was} -> ${c.salePriceMmk === null ? 'none' : formatMmk(c.salePriceMmk)}`
}

export function formatPriceChanges(changes: readonly NamedPriceChange[]): string {
  const lines = changes
    .slice(0, MAX_LISTED)
    .map((c) => `- ${clean(c.name, 120)} (${clean(c.id, 64)}): ${formatMmk(c.priceWas)} -> ${formatMmk(c.priceMmk)}${saleText(c)}`)
  const more = changes.length > MAX_LISTED ? [`...and ${changes.length - MAX_LISTED} more (all are part of the plan)`] : []
  const noun = changes.length === 1 ? 'price change' : 'price changes'
  return [LABEL, `${changes.length} ${noun}${moveRange(changes)}:`, ...lines, ...more].join('\n')
}

/** " (moves from -5% to +12%)", so changes past the listed ones are not out of sight. */
function moveRange(changes: readonly PriceChange[]): string {
  const moves = changes.map(moveOf).filter((m): m is number => m !== null)
  if (moves.length === 0) return ''
  const [lo, hi] = [pct(Math.min(...moves)), pct(Math.max(...moves))]
  return lo === hi ? ` (move ${lo})` : ` (moves from ${lo} to ${hi})`
}

export function formatBlocked(blocked: readonly BlockedProduct[]): string {
  const lines = blocked
    .slice(0, MAX_BLOCKED)
    .map((b) => `- ${clean(b.name, 120)} (${clean(b.id, 64)}): ${clean(b.reason, 120)}`)
  const more = blocked.length > MAX_BLOCKED ? [`...and ${blocked.length - MAX_BLOCKED} more`] : []
  return [
    LABEL,
    `The reprice cannot run - ${blocked.length} product${blocked.length === 1 ? '' : 's'} would come out wrong. Nothing was changed.`,
    ...lines,
    ...more,
    'Fix these with set_price (or end their sale), then run the reprice again.',
  ].join('\n')
}

const isPrice = (v: unknown) => Number.isInteger(v)
const isSale = (v: unknown) => v === null || Number.isInteger(v)

function isChange(c: unknown): boolean {
  const x = c as Partial<NamedPriceChange> | null
  return !!x && isProductId(x.id) && typeof x.name === 'string' && isPrice(x.priceWas) && isPrice(x.priceMmk) &&
    isSale(x.salePriceWas) && isSale(x.salePriceMmk)
}

function isBlocked(b: unknown): boolean {
  const x = b as Partial<BlockedProduct> | null
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.reason === 'string'
}

/** The reprice preview's shape, checked before a plan built from it is stored. */
export function assertRepricePlan(data: unknown): RepricePlan {
  const d = data as Partial<RepricePlan> | null | undefined
  if (!d || !Array.isArray(d.changes) || !Array.isArray(d.blocked) || !d.changes.every(isChange) || !d.blocked.every(isBlocked)) {
    throw new OpsError('BAD_RESPONSE', 200, 'The ops API answered with an unexpected reprice plan.')
  }
  return d as RepricePlan
}
