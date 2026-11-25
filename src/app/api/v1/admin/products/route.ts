import { NextResponse } from 'next/server'
import { fail, ok } from '@/lib/api-response'
import { revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { textVersion } from '@/lib/product-text'
import {
  SlugTakenError,
  insertProduct,
  productFieldsSchema,
  saleProblem,
  slugSchema,
  slugTaken,
} from '@/lib/product-create'

const bodySchema = productFieldsSchema.extend({ slug: slugSchema })

export async function POST(req: Request): Promise<NextResponse> {
  const denied = await requireAdmin()
  if (denied) return denied
  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body.', 400)
  }
  const b = parsed.data

  const sale = saleProblem(b.priceMmk, b.salePriceMmk)
  if (sale) return fail('VALIDATION_ERROR', sale, 400)

  // Slug uniqueness check (id = slug).
  if (await slugTaken(b.slug)) return fail('CONFLICT', 'Slug already in use.', 409)

  try {
    await insertProduct(b)
  } catch (err) {
    if (err instanceof SlugTakenError) return fail('CONFLICT', 'Slug already in use.', 409)
    throw err
  }

  revalidateTag('products')

  // The editor needs the fingerprint to save this product's text later without a reload.
  const text = { name: b.name, tagline: b.tagline, description: b.description, specs: b.specs }
  return ok({ id: b.slug, slug: b.slug, textVersion: textVersion(text) })
}
