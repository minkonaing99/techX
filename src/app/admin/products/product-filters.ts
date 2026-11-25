import { CATEGORIES } from '@/lib/categories'
import type { Row } from './product-form'

export type FilterRow = Pick<Row, 'id' | 'categoryId' | 'stockQty' | 'lowStockThreshold' | 'isActive' | 'hasPhotos'>

export type NeedsWork = 'hidden' | 'noPhotos' | 'lowStock'

export interface ProductFilter {
  /** A category id, or '' for all. */
  category: string
  flag: NeedsWork | null
}

export interface FilterCounts {
  all: number
  categories: Record<string, number>
  flags: Record<NeedsWork, number>
}

export const NO_FILTER: ProductFilter = { category: '', flag: null }

export const NEEDS_WORK: ReadonlyArray<{ value: NeedsWork; label: string }> = [
  { value: 'hidden', label: 'Hidden' },
  { value: 'noPhotos', label: 'No photos' },
  { value: 'lowStock', label: 'Low stock' },
]

/** Sold out counts as low here: both need restocking. */
const NEEDS: Record<NeedsWork, (r: FilterRow) => boolean> = {
  hidden: (r) => !r.isActive,
  noPhotos: (r) => !r.hasPhotos,
  lowStock: (r) => r.stockQty <= r.lowStockThreshold,
}

export function isFiltering(f: ProductFilter): boolean {
  return f.category !== '' || f.flag !== null
}

/** Rows matching every part of the filter, in their original order. `open` rows always stay. */
export function filterRows<T extends FilterRow>(
  rows: readonly T[],
  f: ProductFilter,
  open: ReadonlySet<string> = new Set(),
): T[] {
  return rows.filter(
    (r) => open.has(r.id) || ((!f.category || r.categoryId === f.category) && (!f.flag || NEEDS[f.flag](r))),
  )
}

export function filterCounts(rows: readonly FilterRow[]): FilterCounts {
  const categories = Object.fromEntries(
    CATEGORIES.map((c) => [c.id, rows.filter((r) => r.categoryId === c.id).length]),
  )
  const flags = {
    hidden: rows.filter(NEEDS.hidden).length,
    noPhotos: rows.filter(NEEDS.noPhotos).length,
    lowStock: rows.filter(NEEDS.lowStock).length,
  }
  return { all: rows.length, categories, flags }
}
