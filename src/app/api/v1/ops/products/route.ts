import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { asc } from 'drizzle-orm'
import { fail, ok } from '@/lib/api-response'
import { db } from '@/db'
import { products } from '@/db/schema/products'
import { CATEGORIES } from '@/lib/categories'
import { heldByProduct } from '@/lib/held-stock'
import { noStore, requireOpsToken } from '@/lib/ops-auth'
import {
  SlugTakenError,
  insertProduct,
  productFieldsSchema,
  saleProblem,
  slugFromName,
  slugSchema,
  slugTaken,
} from '@/lib/product-create'
import { line, prose, specsSchema } from '@/lib/ops-text'
import { clientIp } from '@/lib/rate-limit'
import { sendTelegram } from '@/lib/telegram'

/**
 * Every product, hidden ones included, for the owner's MCP. Read straight from
 * the database: the catalog cache is 60s stale and lists active products only.
 *
 * `stockQty` is what is left to sell; `held` is what unpaid orders have set
 * aside on top of it. Never subtract one from the other.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const denied = requireOpsToken(req)
  if (denied) return denied

  const [rows, held] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        categoryId: products.categoryId,
        priceMmk: products.priceMmk,
        salePriceMmk: products.salePriceMmk,
        stockQty: products.stockQty,
        isActive: products.isActive,
        hasPhotos: products.hasPhotos,
      })
      .from(products)
      // `id` last, so products sharing an order and a name keep a stable order.
      .orderBy(asc(products.sortOrder), asc(products.name), asc(products.id)),
    heldByProduct(),
  ])

  return noStore(
    ok({
      // Named field by field, so the answer cannot grow a column by accident.
      products: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        categoryId: r.categoryId,
        priceMmk: r.priceMmk,
        salePriceMmk: r.salePriceMmk,
        stockQty: r.stockQty,
        // Own keys only: a product id such as `constructor` must not read an
        // inherited function off the object.
        held: Object.hasOwn(held, r.id) ? held[r.id] : 0,
        isActive: r.isActive,
        hasPhotos: r.hasPhotos,
      })),
      categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name })),
    }),
  )
}

/**
 * What the owner may set from the Mac; everything else takes a fixed default.
 * Strict, so a field such as `isActive` is refused rather than silently
 * dropped. Stricter than admin on purpose: one typo and one approval must not
 * create a free product.
 */
const createSchema = productFieldsSchema
  .pick({ categoryId: true, stockQty: true })
  .extend({
    dryRun: z.boolean(),
    name: line(120),
    tagline: line(200),
    // Paragraphs are allowed in a description, so only trimmed and not blank.
    description: prose(8000),
    slug: slugSchema.optional(),
    priceMmk: z.number().int().min(1).max(999_999_999),
    salePriceMmk: z.number().int().min(1).max(999_999_999).nullable().optional().default(null),
    specs: specsSchema.optional().default([]),
  })
  .strict()

/** Created hidden, so photos can be added in /admin/products before anyone sees it. */
/** A full Burmese description and 40 specs fit well inside this; refused before the body is read. */
const MAX_BODY_BYTES = 100_000

const DEFAULTS = { swatch: '#7A4F36', lowStockThreshold: 3, isActive: false, featured: false, sortOrder: 0 }

function slugInUse(slug: string): NextResponse {
  return fail('CONFLICT', `Slug already in use: ${slug}. Give another slug.`, 409)
}

/** Creates one product, hidden and without photos, from the owner's text. */
export async function POST(req: Request): Promise<NextResponse> {
  const denied = requireOpsToken(req)
  if (denied) return denied
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return fail('PAYLOAD_TOO_LARGE', 'The product text is too long.', 413)
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body.', 400)
  }
  const { dryRun, slug: given, ...fields } = parsed.data
  const sale = saleProblem(fields.priceMmk, fields.salePriceMmk)
  if (sale) return fail('VALIDATION_ERROR', sale, 400)

  const slug = given ?? slugFromName(fields.name)
  if (!slug) {
    return fail('VALIDATION_ERROR', 'The name has too few Latin letters or digits to make a slug from. Give a slug.', 400)
  }
  if (await slugTaken(slug)) return slugInUse(slug)
  if (dryRun) return noStore(ok({ applied: false, id: slug, slug }))

  try {
    await insertProduct({ ...fields, ...DEFAULTS, slug })
  } catch (err) {
    if (err instanceof SlugTakenError) return slugInUse(slug)
    throw err
  }

  console.info('[ops] product created', { ip: clientIp(req), id: slug })
  revalidateTag('products')
  // Never awaited: a slow or failed Telegram must not delay or fail a committed write.
  void sendTelegram(`Product created from the Mac (hidden): ${slug}`).catch(() => {})
  return noStore(ok({ applied: true, id: slug, slug }))
}
