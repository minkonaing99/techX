import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { and, countDistinct, eq, notInArray } from 'drizzle-orm'
import { fail, ok } from '@/lib/api-response'
import { db } from '@/db'
import { orderItems, orders } from '@/db/schema/orders'
import { products } from '@/db/schema/products'
import { heldByProduct } from '@/lib/held-stock'
import { PRODUCT_ID_RE } from '@/lib/ids'
import { noStore, requireOpsToken } from '@/lib/ops-auth'
import { TERMINAL_STATUSES } from '@/lib/order-transitions'
import { clientIp } from '@/lib/rate-limit'
import { sendTelegram } from '@/lib/telegram'

const bodySchema = z.object({
  dryRun: z.boolean(),
  active: z.boolean(),
  /** Publish even with no photos; the shop then shows a placeholder. */
  force: z.boolean().optional(),
})

/** What hiding a product leaves behind: units unpaid orders hold, and orders still open. */
async function orderLoad(id: string): Promise<{ held: number; openOrders: number }> {
  const [rows, held] = await Promise.all([
    db
      .select({ openOrders: countDistinct(orders.id) })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orderItems.productId, id), notInArray(orders.status, [...TERMINAL_STATUSES]))),
    heldByProduct(),
  ])
  return { held: Object.hasOwn(held, id) ? held[id]! : 0, openOrders: Number(rows[0]?.openOrders ?? 0) }
}

function noPhotos(id: string): NextResponse {
  // Read by Claude through the MCP: no hint to force it - that is the owner's call.
  return fail('NO_PHOTOS', `${id} has no photos. Upload them in /admin/products first.`, 409)
}

/**
 * Publishes or hides one product. Setting a product to the state it is already
 * in changes nothing, so no compare-and-set is needed. Publishing without
 * photos needs `force`; hiding is never blocked, but reports open orders.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireOpsToken(req)
  if (denied) return denied
  const { id } = await params
  if (!PRODUCT_ID_RE.test(id)) return fail('VALIDATION_ERROR', 'Invalid id.', 400)

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body.', 400)
  }
  const { dryRun, active, force } = parsed.data

  const [row] = await db
    .select({ isActive: products.isActive, hasPhotos: products.hasPhotos, stockQty: products.stockQty })
    .from(products)
    .where(eq(products.id, id))
    .limit(1)
  if (!row) return fail('NOT_FOUND', `No such product: ${id}.`, 404)

  const changed = row.isActive !== active
  if (changed && active && !row.hasPhotos && !force) return noPhotos(id)
  const report = {
    changed,
    active,
    stockQty: row.stockQty,
    hasPhotos: row.hasPhotos,
    ...(active ? {} : await orderLoad(id)),
  }
  if (dryRun || !changed) return noStore(ok({ applied: false, ...report }))

  // Unforced publishing requires photos in the write itself: ones removed in
  // /admin/products after the check above must not slip through.
  const needsPhotos = active && !force
  const [header] = await db
    .update(products)
    .set({ isActive: active })
    .where(needsPhotos ? and(eq(products.id, id), eq(products.hasPhotos, true)) : eq(products.id, id))
  // affectedRows counts matched rows (FOUND_ROWS, see src/db/index.ts), so a
  // product already in the asked state still matches. A miss is a deleted row,
  // or photos removed after the check.
  if (header.affectedRows !== 1) {
    const [after] = await db.select({ hasPhotos: products.hasPhotos }).from(products).where(eq(products.id, id)).limit(1)
    return after ? noPhotos(id) : fail('NOT_FOUND', `No such product: ${id}.`, 404)
  }

  console.info('[ops] visibility', { ip: clientIp(req), id, active })
  revalidateTag('products')
  // Never awaited: a slow or failed Telegram must not delay or fail a committed write.
  void sendTelegram(`${active ? 'Published' : 'Hidden'} from the Mac: ${id}`).catch(() => {})
  return noStore(ok({ applied: true, ...report }))
}
