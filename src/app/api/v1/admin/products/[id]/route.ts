import { NextResponse } from 'next/server'
import { fail, ok } from '@/lib/api-response'
import { z } from 'zod'
import { isCategoryId } from '@/lib/categories'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { products, productSpecs } from '@/db/schema/products'
import { orderItems } from '@/db/schema/orders'
import { requireAdmin } from '@/lib/admin-guard'
import { PRODUCT_ID_RE } from '@/lib/ids'
import { isValidSalePrice, salePriceMessage } from '@/lib/pricing'
import { deletePublic } from '@/lib/r2'
import { revalidateTag } from 'next/cache'
import { lockProductText, type Tx } from '@/lib/product-edit'
import { TEXT_VERSION_RE, applyEdit, textVersion, type TextEdit } from '@/lib/product-text'


const specSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(200),
})

function touchesText(d: TextEdit): boolean {
  return d.name !== undefined || d.tagline !== undefined || d.description !== undefined || d.specs !== undefined
}

const patchSchema = z
  .object({
    name: z.string().min(1).max(120),
    tagline: z.string().min(1).max(200),
    description: z.string().min(1).max(8000),
    // Replaces the dropped `products.category_id` foreign key: with no
    // `categories` table there is nothing at the database level stopping an
    // unknown id, which would render a product no shop page can list.
    categoryId: z.string().refine(isCategoryId, 'Unknown category.'),
    priceMmk: z.number().int().min(0).max(999_999_999),
    salePriceMmk: z.number().int().min(0).max(999_999_999).nullable(),
    swatch: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    stockQty: z.number().int().min(0).max(100_000),
    /** The stock number the edit replaces. Required with `stockQty`. */
    stockQtyWas: z.number().int().min(0).max(100_000),
    lowStockThreshold: z.number().int().min(0).max(100),
    isActive: z.boolean(),
    featured: z.boolean(),
    sortOrder: z.number().int().min(0).max(100_000),
    hasPhotos: z.boolean(),
    specs: z.array(specSchema).max(40),
    /** The `textVersion` the editor loaded. Required with any text field. */
    textWas: z.string().regex(TEXT_VERSION_RE),
  })
  .partial()
  .refine((d) => d.stockQty === undefined || d.stockQtyWas !== undefined, {
    // A tab opened before stock edits were guarded sends stock alone.
    message: 'This page is out of date. Reload before editing stock.',
    path: ['stockQtyWas'],
  })
  .refine((d) => !touchesText(d) || d.textWas !== undefined, {
    // A tab opened before text edits were guarded sends text alone.
    message: 'This page is out of date. Reload before saving.',
    path: ['textWas'],
  })

/** Internal transaction-abort signal: stock moved since the editor loaded it. */
const STOCK_CHANGED = 'STOCK_CHANGED'
/** Internal transaction-abort signals for the text guard. */
const TEXT_CHANGED = 'TEXT_CHANGED'
const PRODUCT_GONE = 'PRODUCT_GONE'

/**
 * The MCP edits text from the Mac, so an editor open since before that edit
 * must not save its old text over it. Locks the product's text, checks it still
 * reads as the editor loaded it, and returns the fingerprint after this save.
 */
async function guardText(tx: Tx, id: string, textWas: string | undefined, edit: TextEdit): Promise<string> {
  const current = await lockProductText(tx, id)
  if (!current) throw new Error(PRODUCT_GONE)
  if (current.textVersion !== textWas) throw new Error(TEXT_CHANGED)
  return textVersion(applyEdit(current, edit))
}

type Patch = z.infer<typeof patchSchema>
type Fields = Omit<Patch, 'specs' | 'stockQtyWas' | 'textWas'>

/**
 * Either price field can invalidate the pair, so a write touching one has to
 * be checked against the stored value of the other. Read outside the
 * transaction, and only when a price is actually in play - a stock or photo
 * toggle must not pay for an extra query.
 */
async function priceProblem(id: string, fields: Fields): Promise<NextResponse | null> {
  if (!('priceMmk' in fields || 'salePriceMmk' in fields)) return null
  const [row] = await db
    .select({ priceMmk: products.priceMmk, salePriceMmk: products.salePriceMmk })
    .from(products)
    .where(eq(products.id, id))
    .limit(1)
  if (!row) return fail('NOT_FOUND', 'Product not found.', 404)

  const nextPrice = fields.priceMmk ?? Number(row.priceMmk)
  // `??` would be wrong here: an explicit null is the admin clearing the
  // sale, and `??` would fall through to the stored price and refuse it.
  const nextSale =
    'salePriceMmk' in fields
      ? fields.salePriceMmk ?? null
      : row.salePriceMmk === null
        ? null
        : Number(row.salePriceMmk)

  if (!isValidSalePrice(nextPrice, nextSale)) {
    return fail('VALIDATION_ERROR', salePriceMessage(nextPrice, nextSale), 400)
  }
  return null
}

async function writeProduct(tx: Tx, id: string, fields: Fields, specs: Patch['specs'], stockQtyWas: number | undefined) {
  if (Object.keys(fields).length > 0) {
    // Checkout takes stock while the admin page sits open, so a stock write
    // lands only over the number the editor saw. Without the guard, saving
    // would put back every unit sold since the page loaded.
    const stockGuarded = fields.stockQty !== undefined && stockQtyWas !== undefined
    const [header] = await tx
      .update(products)
      .set(fields)
      .where(stockGuarded ? and(eq(products.id, id), eq(products.stockQty, stockQtyWas)) : eq(products.id, id))
    if (stockGuarded && header.affectedRows !== 1) throw new Error(STOCK_CHANGED)
  }
  if (specs === undefined) return
  await tx.delete(productSpecs).where(eq(productSpecs.productId, id))
  if (specs.length === 0) return
  await tx
    .insert(productSpecs)
    .values(specs.map((s, i) => ({ productId: id, label: s.label, value: s.value, sortOrder: i })))
}

/** Turns a transaction abort into the answer for the editor; anything else is rethrown. */
async function saveFailure(err: unknown, id: string): Promise<NextResponse> {
  const reason = err instanceof Error ? err.message : ''
  if (reason === PRODUCT_GONE) return fail('NOT_FOUND', 'Product not found.', 404)
  if (reason === TEXT_CHANGED) {
    return fail(
      'TEXT_CHANGED',
      "This product's text changed since you opened it - it may have been edited from the Mac. Reload before saving.",
      409,
    )
  }
  if (reason !== STOCK_CHANGED) throw err
  // Zero rows is also what a missing product looks like. Read it back to
  // tell the two apart, and hand the editor the number to adopt.
  const [now] = await db.select({ stockQty: products.stockQty }).from(products).where(eq(products.id, id)).limit(1)
  if (!now) return fail('NOT_FOUND', 'Product not found.', 404)
  return fail(
    'STOCK_CHANGED',
    `Stock changed to ${now.stockQty} since you opened this page - an order may have come in. Check the number and save again.`,
    409,
    { stockQty: now.stockQty },
  )
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  if (!PRODUCT_ID_RE.test(id)) {
    return fail('VALIDATION_ERROR', 'Invalid id.', 400)
  }
  const raw = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    const stale = parsed.error.issues.find((i) => i.path[0] === 'stockQtyWas' || i.path[0] === 'textWas')
    return fail('VALIDATION_ERROR', stale?.message ?? 'Invalid body.', 400)
  }

  const { specs, stockQtyWas, textWas, ...fields } = parsed.data
  const priceRefusal = await priceProblem(id, fields)
  if (priceRefusal) return priceRefusal

  const textEdit: TextEdit = { name: fields.name, tagline: fields.tagline, description: fields.description, specs }
  let nextTextVersion: string | undefined
  try {
    await db.transaction(async (tx) => {
      if (touchesText(textEdit)) nextTextVersion = await guardText(tx, id, textWas, textEdit)
      await writeProduct(tx, id, fields, specs, stockQtyWas)
    })
  } catch (err) {
    return saveFailure(err, id)
  }

  revalidateTag('products')
  return ok({ ok: true, ...(nextTextVersion ? { textVersion: nextTextVersion } : {}) })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  if (!PRODUCT_ID_RE.test(id)) {
    return fail('VALIDATION_ERROR', 'Invalid id.', 400)
  }

  const [row] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, id))
    .limit(1)
  if (!row) {
    return fail('NOT_FOUND', 'Product not found.', 404)
  }

  // Refuse hard-delete when any order references this product - orders
  // need to keep their referential history intact. Admin should flip
  // is_active = false instead (soft delete; hides from /shop, preserves
  // order rows).
  const [refOrder] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.productId, id))
    .limit(1)
  if (refOrder) {
    return fail('CONFLICT', 'Product is referenced by existing orders. Toggle "Active" off to hide it instead.', 409)
  }

  // Safe to hard-delete. FK cascades will clean product_specs, reviews,
  // cart_items, wishlists. R2 objects (hero + thumb for each slot) are
  // not cascaded - drop them best-effort. revalidate the catalog cache.
  await db.delete(products).where(eq(products.id, id))

  const slug = row.slug
  const slots = ['01', '02', '03', '04']
  await Promise.allSettled(
    slots.flatMap((s) => [
      deletePublic(`products/${slug}/${s}.webp`),
      deletePublic(`products/${slug}/${s}-thumb.webp`),
    ]),
  )

  revalidateTag('products')
  return ok({ ok: true })
}
