import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { products, productSpecs } from '@/db/schema/products'
import { applyEdit, changedFields, textVersion, type ProductText, type TextEdit, type TextField } from './product-text'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The order specs are shown and fingerprinted in. Shared with /admin/products,
 * so the page and the edit lock can never disagree and refuse every save.
 */
export const SPEC_ORDER = [asc(productSpecs.sortOrder), asc(productSpecs.id)] as const

type Executor = typeof db | Tx

export interface ProductTextRow extends ProductText {
  id: string
  slug: string
  isActive: boolean
  hasPhotos: boolean
  textVersion: string
}

export type EditResult =
  | { status: 'not_found' }
  | { status: 'stale' }
  | { status: 'ok'; changed: TextField[]; textVersion: string }

/** A product's text and specs in display order; `lock` takes both rows FOR UPDATE. */
async function selectText(ex: Executor, id: string, lock: boolean): Promise<ProductTextRow | null> {
  const header = ex
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      tagline: products.tagline,
      description: products.description,
      isActive: products.isActive,
      hasPhotos: products.hasPhotos,
    })
    .from(products)
    .where(eq(products.id, id))
    .limit(1)
  const [row] = lock ? await header.for('update') : await header
  if (!row) return null
  const specQuery = ex
    .select({ label: productSpecs.label, value: productSpecs.value })
    .from(productSpecs)
    .where(eq(productSpecs.productId, id))
    .orderBy(...SPEC_ORDER)
  const specs = lock ? await specQuery.for('update') : await specQuery
  const text = { name: row.name, tagline: row.tagline, description: row.description, specs }
  return { ...row, specs, textVersion: textVersion(text) }
}

export function readProductText(id: string): Promise<ProductTextRow | null> {
  return selectText(db, id, false)
}

/** Locks a product's text inside a transaction, for an edit that must land only over what was read. */
export function lockProductText(tx: Tx, id: string): Promise<ProductTextRow | null> {
  return selectText(tx, id, true)
}

/** Writes the changed fields only; specs are replaced as a whole list. Never touches id or slug. */
async function writeText(tx: Tx, id: string, next: ProductText, changed: readonly TextField[]): Promise<void> {
  const header: Partial<Pick<ProductText, 'name' | 'tagline' | 'description'>> = {}
  for (const f of changed) if (f !== 'specs') header[f] = next[f]
  if (Object.keys(header).length > 0) await tx.update(products).set(header).where(eq(products.id, id))
  if (!changed.includes('specs')) return
  await tx.delete(productSpecs).where(eq(productSpecs.productId, id))
  if (next.specs.length === 0) return
  await tx
    .insert(productSpecs)
    .values(next.specs.map((s, i) => ({ productId: id, label: s.label, value: s.value, sortOrder: i })))
}

/**
 * Applies an edit to a product's text if it still reads as `textWas`. A dry run,
 * or an edit that changes nothing, writes nothing and reports the same result.
 */
export async function editProductText(
  id: string,
  textWas: string,
  edit: TextEdit,
  dryRun: boolean,
): Promise<EditResult> {
  return db.transaction(async (tx) => {
    const current = await lockProductText(tx, id)
    if (!current) return { status: 'not_found' }
    if (current.textVersion !== textWas) return { status: 'stale' }
    const changed = changedFields(current, edit)
    const next = applyEdit(current, edit)
    if (!dryRun && changed.length > 0) await writeText(tx, id, next, changed)
    return { status: 'ok', changed, textVersion: textVersion(next) }
  })
}
