import { NextResponse } from 'next/server'
import { fail, ok, rateLimited } from '@/lib/api-response'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { orders } from '@/db/schema/orders'
import { auth } from '@/lib/auth'
import { UUID_RE } from '@/lib/ids'
import { clientKey, rateLimit } from '@/lib/rate-limit'
import { mailOrAlert } from '@/lib/notify'
import { orderUrl, shopUrl } from '@/lib/links'
import { shortOrderId } from '@/lib/order-status'
import { OrderCancelled } from '@emails/order-cancelled'
import { revalidateTag } from 'next/cache'
import { holdsStock } from '@/lib/order-transitions'
import { orderStockLines, returnStock } from '@/lib/stock'


export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) return fail('UNAUTHENTICATED', 'Sign in required.', 401)
  const userId = session.user.id

  const { id } = await params
  if (!UUID_RE.test(id)) return fail('VALIDATION_ERROR', 'Invalid id.', 400)

  const limit = rateLimit({
    key: clientKey(req, `cancel:${userId}`),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (!limit.allowed) {
    return rateLimited('Too many cancel attempts.', limit.retryAfterSeconds)
  }

  // An order that reserved stock at checkout gives it back here; one placed
  // before reservation holds none until confirmed, so cancelling it is a
  // status flip.
  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, userId)))
      .limit(1)
    if (!order) return { kind: 'NOT_FOUND' as const }
    if (order.status !== 'pending_payment') return { kind: 'CONFLICT' as const }

    // The select takes no lock, so the unpaid-order sweep or a slip upload can
    // move the order before this write. Conditional, so only one of them wins
    // and only the winner emails.
    const [header] = await tx
      .update(orders)
      .set({ status: 'cancelled' })
      .where(and(eq(orders.id, id), eq(orders.userId, userId), eq(orders.status, 'pending_payment')))
    if (header.affectedRows !== 1) return { kind: 'CONFLICT' as const }

    // Only after winning the cancel, so stock goes back once however many
    // writers race for the order.
    const releases = holdsStock(order.status, order.stockReserved)
    if (releases) await returnStock(tx, await orderStockLines(tx, id))

    return { kind: 'OK' as const, total: Number(order.totalMmk), releases }
  })

  if (result.kind === 'NOT_FOUND') return fail('NOT_FOUND', 'Order not found.', 404)
  if (result.kind === 'CONFLICT') {
    return fail('CONFLICT', 'Only pending orders can be cancelled. Contact us via Telegram.', 409)
  }
  if (result.releases) revalidateTag('products')

  await mailOrAlert({
    to: session.user.email ?? '',
    subject: `Order ${shortOrderId(id)} - cancelled`,
    react: OrderCancelled({
      orderId: id,
      orderUrl: orderUrl(id),
      shopUrl: shopUrl(),
      reason: 'Customer cancelled.',
    }),
  }, `order ${shortOrderId(id)} cancelled (customer)`)

  return ok({ ok: true })
}
