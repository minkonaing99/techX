import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fail, ok } from '@/lib/api-response'
import { db } from '@/db'
import { products } from '@/db/schema/products'
import { isCategoryId } from '@/lib/categories'
import { noStore, requireOpsToken } from '@/lib/ops-auth'
import { PERCENT_MAX, PERCENT_MIN, ROUND_STEPS, planReprice } from '@/lib/ops-pricing'

const bodySchema = z.object({
  percent: z
    .number()
    .min(PERCENT_MIN)
    .max(PERCENT_MAX)
    // Whole basis points: 8.25 is fine, 8.125 is not.
    .refine((p) => Math.abs(p * 100 - Math.round(p * 100)) < 1e-9, 'Percent may have at most two decimals.'),
  roundTo: z.union([z.literal(ROUND_STEPS[0]), z.literal(ROUND_STEPS[1]), z.literal(ROUND_STEPS[2])]),
  category: z.string().refine(isCategoryId, 'Unknown category.').optional(),
  includeInactive: z.boolean().default(true),
})

/**
 * What a bulk reprice would change, and which products would block it. Writes
 * nothing; the owner's MCP applies the returned changes through `PATCH prices`,
 * which checks each one still holds.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const denied = requireOpsToken(req)
  if (denied) return denied

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body.', 400)
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      categoryId: products.categoryId,
      priceMmk: products.priceMmk,
      salePriceMmk: products.salePriceMmk,
      isActive: products.isActive,
    })
    .from(products)

  return noStore(ok(planReprice(rows, parsed.data)))
}
