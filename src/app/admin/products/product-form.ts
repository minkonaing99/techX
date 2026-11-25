import { SLUG_REGEX } from '@/lib/slugify'
import { isValidSalePrice, salePriceMessage } from '@/lib/pricing'
import type { ProductFormValues } from './product-details-form'

export interface Row {
  id: string
  name: string
  slug: string
  categoryId: string
  priceMmk: number
  salePriceMmk: number | null
  tagline: string
  description: string
  swatch: string
  stockQty: number
  lowStockThreshold: number
  sortOrder: number
  featured: boolean
  isActive: boolean
  hasPhotos: boolean
  specs: Array<{ label: string; value: string }>
  /** Fingerprint of the text as loaded; a save sends it back as `textWas`. */
  textVersion: string
}

export type ExpandedSection = 'details' | 'photos' | null

export function rowToForm(r: Row): ProductFormValues {
  return {
    name: r.name,
    slug: r.slug,
    categoryId: r.categoryId,
    priceMmk: String(r.priceMmk),
    salePriceMmk: r.salePriceMmk === null ? '' : String(r.salePriceMmk),
    tagline: r.tagline,
    description: r.description,
    swatch: r.swatch,
    stockQty: String(r.stockQty),
    lowStockThreshold: String(r.lowStockThreshold),
    sortOrder: String(r.sortOrder),
    isActive: r.isActive,
    featured: r.featured,
    specs: r.specs.map((s) => ({ ...s })),
  }
}

export function emptyForm(catId: string): ProductFormValues {
  return {
    name: '',
    slug: '',
    categoryId: catId,
    priceMmk: '0',
    salePriceMmk: '',
    tagline: '',
    description: '',
    swatch: '#7A4F36',
    stockQty: '0',
    lowStockThreshold: '3',
    sortOrder: '0',
    isActive: true,
    featured: false,
    specs: [],
  }
}

/**
 * The row the table shows after a successful write. `id`, `slug` and
 * `hasPhotos` are not the form's to decide: on create the server picks the
 * slug, on edit the slug is read-only. Specs stay as typed, unlike the body.
 */
export function formToRow(v: ProductFormValues, base: Pick<Row, 'id' | 'slug' | 'hasPhotos' | 'textVersion'>): Row {
  return {
    id: base.id,
    slug: base.slug,
    hasPhotos: base.hasPhotos,
    textVersion: base.textVersion,
    name: v.name.trim(),
    categoryId: v.categoryId,
    priceMmk: Number(v.priceMmk) || 0,
    salePriceMmk: v.salePriceMmk.trim() === '' ? null : Number(v.salePriceMmk),
    tagline: v.tagline.trim(),
    description: v.description.trim(),
    swatch: v.swatch,
    stockQty: Number(v.stockQty) || 0,
    lowStockThreshold: Number(v.lowStockThreshold) || 3,
    sortOrder: Number(v.sortOrder) || 0,
    featured: v.featured,
    isActive: v.isActive,
    specs: v.specs,
  }
}

export function validateForm(v: ProductFormValues, isCreate: boolean, existingSlugs: Set<string>): string[] {
  const errs: string[] = []
  if (!v.name.trim()) errs.push('Name is required.')
  if (!SLUG_REGEX.test(v.slug)) errs.push('Slug must be lowercase letters, digits, and dashes only.')
  if (isCreate && existingSlugs.has(v.slug)) errs.push('Slug already in use.')
  if (!v.categoryId) errs.push('Pick a category.')
  if (Number(v.priceMmk) < 0 || Number.isNaN(Number(v.priceMmk))) errs.push('Price must be a non-negative number.')
  if (v.salePriceMmk.trim() !== '') {
    const sale = Number(v.salePriceMmk)
    if (Number.isNaN(sale)) {
      errs.push('Sale price must be a number, or blank for no sale.')
    } else if (!isValidSalePrice(Number(v.priceMmk), sale)) {
      errs.push(salePriceMessage(Number(v.priceMmk), sale))
    }
  }
  if (!v.tagline.trim()) errs.push('Tagline is required.')
  if (!v.description.trim()) errs.push('Description is required.')
  if (!/^#[0-9A-Fa-f]{6}$/.test(v.swatch)) errs.push('Swatch must be a 6-digit hex.')
  if (Number(v.stockQty) < 0 || Number.isNaN(Number(v.stockQty))) errs.push('Stock must be a non-negative number.')
  if (Number(v.lowStockThreshold) < 0 || Number.isNaN(Number(v.lowStockThreshold))) errs.push('Low-stock threshold must be a non-negative number.')
  for (const s of v.specs) {
    if (!s.label.trim() || !s.value.trim()) {
      errs.push('Every spec row needs both a label and a value (or remove the row).')
      break
    }
  }
  return errs
}

export function formToBody(v: ProductFormValues) {
  return {
    slug: v.slug,
    name: v.name.trim(),
    categoryId: v.categoryId,
    priceMmk: Number(v.priceMmk) || 0,
    salePriceMmk: v.salePriceMmk.trim() === '' ? null : Number(v.salePriceMmk),
    tagline: v.tagline.trim(),
    description: v.description.trim(),
    swatch: v.swatch,
    stockQty: Number(v.stockQty) || 0,
    lowStockThreshold: Number(v.lowStockThreshold) || 3,
    sortOrder: Number(v.sortOrder) || 0,
    isActive: v.isActive,
    featured: v.featured,
    specs: v.specs.map((s) => ({ label: s.label.trim(), value: s.value.trim() })),
  }
}

/**
 * The PATCH body for an edit. Stock goes only when the admin changed it, with
 * the number it replaces, so the server can refuse a write over stock that
 * moved while the page was open. The text always goes with the fingerprint it
 * was loaded as, so an edit made from the Mac meanwhile is not overwritten.
 */
export function formToPatch(v: ProductFormValues, original: Row) {
  const { stockQty, ...rest } = formToBody(v)
  const body = { ...rest, textWas: original.textVersion }
  return stockQty === original.stockQty ? body : { ...body, stockQty, stockQtyWas: original.stockQty }
}

export function formIsDirty(a: ProductFormValues, b: ProductFormValues): boolean {
  if (
    a.name !== b.name ||
    a.slug !== b.slug ||
    a.categoryId !== b.categoryId ||
    a.priceMmk !== b.priceMmk ||
    a.salePriceMmk !== b.salePriceMmk ||
    a.tagline !== b.tagline ||
    a.description !== b.description ||
    a.swatch !== b.swatch ||
    a.stockQty !== b.stockQty ||
    a.lowStockThreshold !== b.lowStockThreshold ||
    a.sortOrder !== b.sortOrder ||
    a.isActive !== b.isActive ||
    a.featured !== b.featured
  ) {
    return true
  }
  if (a.specs.length !== b.specs.length) return true
  for (let i = 0; i < a.specs.length; i++) {
    if (a.specs[i]!.label !== b.specs[i]!.label || a.specs[i]!.value !== b.specs[i]!.value) {
      return true
    }
  }
  return false
}
