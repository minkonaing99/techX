import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { products, productSpecs } from '@/db/schema/products'
import { isCategoryId } from '@/lib/categories'
import { isValidSalePrice, salePriceMessage } from '@/lib/pricing'
import { SLUG_REGEX, slugify } from '@/lib/slugify'

/*
 * Creating a product, shared by the admin route and the owner's ops API so the
 * rules cannot drift between them.
 */

/** `products.id` is `varchar(64)`, and id = slug. */
export const SLUG_MAX = 64

export const slugSchema = z.string().min(2).max(SLUG_MAX).regex(SLUG_REGEX)

export const specSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(200),
})

/** Every field of a new product except the slug, with the admin form's bounds. */
export const productFieldsSchema = z.object({
  name: z.string().min(1).max(120),
  // Replaces the dropped `products.category_id` foreign key: with no
  // `categories` table there is nothing at the database level stopping an
  // unknown id, which would render a product no shop page can list.
  categoryId: z.string().refine(isCategoryId, 'Unknown category.'),
  priceMmk: z.number().int().min(0).max(999_999_999),
  salePriceMmk: z.number().int().min(0).max(999_999_999).nullable().optional().default(null),
  tagline: z.string().min(1).max(200),
  description: z.string().min(1).max(8000),
  swatch: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  stockQty: z.number().int().min(0).max(100_000),
  lowStockThreshold: z.number().int().min(0).max(100),
  isActive: z.boolean(),
  featured: z.boolean(),
  sortOrder: z.number().int().min(0).max(100_000).optional().default(0),
  specs: z.array(specSchema).max(40),
})

export type NewProduct = z.infer<typeof productFieldsSchema> & { slug: string }

/** A slug made from the name, or null when the name has too few Latin letters or digits (a Burmese name, say). */
export function slugFromName(name: string): string | null {
  const slug = slugify(name)
  return slugSchema.safeParse(slug).success ? slug : null
}

/**
 * The cross-field sale rule, kept out of zod so every product route shares one
 * rule and one message.
 */
export function saleProblem(priceMmk: number, salePriceMmk: number | null): string | null {
  return isValidSalePrice(priceMmk, salePriceMmk) ? null : salePriceMessage(priceMmk, salePriceMmk)
}

export class SlugTakenError extends Error {
  constructor(readonly slug: string) {
    super(`Slug already in use: ${slug}.`)
    this.name = 'SlugTakenError'
  }
}

export async function slugTaken(slug: string): Promise<boolean> {
  const rows = await db.select({ id: products.id }).from(products).where(eq(products.id, slug)).limit(1)
  return rows.length > 0
}

/** Drizzle wraps the driver error; mysql2 names a unique-key clash ER_DUP_ENTRY. */
function isDuplicateKey(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null
  return e?.code === 'ER_DUP_ENTRY' || e?.cause?.code === 'ER_DUP_ENTRY'
}

/**
 * Inserts the product (id = slug, no photos) and its specs, in their given
 * order, in one transaction. Throws `SlugTakenError` when another create took
 * the slug after the caller's `slugTaken` check.
 */
export async function insertProduct(p: NewProduct): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(products).values({
        id: p.slug,
        slug: p.slug,
        name: p.name,
        categoryId: p.categoryId,
        priceMmk: p.priceMmk,
        salePriceMmk: p.salePriceMmk,
        tagline: p.tagline,
        description: p.description,
        swatch: p.swatch,
        stockQty: p.stockQty,
        lowStockThreshold: p.lowStockThreshold,
        hasPhotos: false,
        isActive: p.isActive,
        featured: p.featured,
        sortOrder: p.sortOrder,
      })
      if (p.specs.length > 0) {
        await tx.insert(productSpecs).values(
          p.specs.map((s, i) => ({ productId: p.slug, label: s.label, value: s.value, sortOrder: i })),
        )
      }
    })
  } catch (err) {
    if (isDuplicateKey(err)) throw new SlugTakenError(p.slug)
    throw err
  }
}
