import { NextResponse } from 'next/server'
import { fail, ok } from '@/lib/api-response'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { orders, orderItems, type OrderStatus } from '@/db/schema/orders'
import { paymentMethods } from '@/db/schema/payment-methods'
import { users } from '@/db/schema/auth'
import { requireAdmin } from '@/lib/admin-guard'
import { UUID_RE } from '@/lib/ids'
import { ORDER_EXPIRY_MS, canTransition, holdsStock } from '@/lib/order-transitions'
import { shortOrderId } from '@/lib/order-status'
import { mailOrAlert } from '@/lib/notify'
import { formatMmk } from '@/lib/money'
import { orderUrl, shopUrl } from '@/lib/links'
import { orderStockLines, returnStock } from '@/lib/stock'
import { OrderInvoice } from '@emails/order-invoice'
import { OrderDelivered } from '@emails/order-delivered'
import { OrderCancelled } from '@emails/order-cancelled'
import { SlipRejected } from '@emails/slip-rejected'
import { orderTimestamp } from '@/lib/relative-time'
import { REJECTION_REASON_MAX } from '@/lib/slip-rejection'


/** Internal transaction-abort signal: the order moved after it was read. */
const STATUS_CHANGED = 'STATUS_CHANGED'


const patchSchema = z.object({
  status: z.enum([
    'pending_payment',
    'payment_submitted',
    'confirmed',
    'delivered',
    'cancelled',
  ]),
  notes: z.string().max(2000).optional(),
  /** Required when sending a slip back; ignored on every other move. */
  reason: z.string().trim().max(REJECTION_REASON_MAX).optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return fail('VALIDATION_ERROR', 'Invalid id.', 400)
  }
  const raw = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.path[0] === 'reason')
    return fail('VALIDATION_ERROR', tooLong ? `Keep the reason under ${REJECTION_REASON_MAX} characters.` : 'Invalid status.', 400)
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
  if (!order) {
    return fail('NOT_FOUND', 'Order not found.', 404)
  }

  const [method] = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.id, order.paymentMethodId))
    .limit(1)
  const kind = method?.kind === 'cod' ? 'cod' : 'wallet'

  if (!canTransition(order.status, parsed.data.status, kind)) {
    return fail('CONFLICT', `Cannot transition ${order.status} → ${parsed.data.status}.`, 409)
  }

  const patch: {
    status: OrderStatus
    notes?: string
    expiresAt?: Date
    paymentRejectionReason?: string | null
    paymentReminderSentAt?: null
  } = { status: parsed.data.status }
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes

  const next = parsed.data.status
  const prev = order.status
  const reason = parsed.data.reason
  const isRejecting = prev === 'payment_submitted' && next === 'pending_payment'
  // The customer is told why, so a slip never goes back without a reason.
  if (isRejecting && !reason) {
    return fail('VALIDATION_ERROR', 'Choose a reason for sending the slip back.', 400)
  }
  // A rejected slip sends the order back for a new upload. Its original expiry
  // has likely passed, and the sweep would cancel it within the hour. The new
  // deadline gets its own reminder.
  if (isRejecting) {
    patch.expiresAt = new Date(Date.now() + ORDER_EXPIRY_MS)
    patch.paymentRejectionReason = reason
    patch.paymentReminderSentAt = null
  }
  if (next === 'payment_submitted') patch.paymentRejectionReason = null
  // Confirming sends the invoice; the stock was taken at checkout. Cancelling
  // an order that holds stock (`holdsStock`) gives it back.
  const isConfirming = next === 'confirmed' && prev !== 'confirmed'
  const isReleasing = next === 'cancelled' && holdsStock(prev, order.stockReserved)

  // Every order placed since checkout reserves stock holds it already. One
  // that does not (a hand-edited or restored row) would sell stock never set
  // aside, and cancelling it later would add stock that was never taken.
  if (isConfirming && !order.stockReserved) {
    return fail(
      'CONFLICT',
      'This order was placed before checkout reserved stock, so it holds none. Cancel it and ask the customer to order again.',
      409,
    )
  }

  try {
    await db.transaction(async (tx) => {
      // Claim first, conditional on the status read above. The unpaid-order
      // sweep or a customer may have moved the order since. Claiming before any
      // stock write also locks the order row ahead of product rows, the same
      // order every other writer uses, so two of them cannot deadlock.
      const [header] = await tx
        .update(orders)
        .set(patch)
        .where(and(eq(orders.id, id), eq(orders.status, prev)))
      if (header.affectedRows !== 1) throw new Error(STATUS_CHANGED)

      // A throw from here on rolls the claim back with the stock.
      if (isReleasing) await returnStock(tx, await orderStockLines(tx, id))
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === STATUS_CHANGED) {
      return fail('CONFLICT', 'This order changed since you opened it. Reload and try again.', 409)
    }
    throw err
  }

  // Stock just came back - bust the catalog cache so shop pages and cart-add
  // checks see it immediately instead of waiting 60s for revalidate.
  if (isReleasing) {
    revalidateTag('products')
  }

  const [user] = await db.select().from(users).where(eq(users.id, order.userId)).limit(1)
  const customerEmail = user?.email
  const total = formatMmk(Number(order.totalMmk))
  const placedAt = order.placedAt.toISOString()
  // `order` was read before the update, so its `updatedAt` still holds the
  // previous transition. The one this request just made is now.
  const movedAt = new Date().toISOString()

  // Customer-facing emails: invoice at payment confirmation (paid OR
  // confirmed), delivered note at delivered, cancellation at cancelled.
  // No mail on shipped - invoice email already told them shipping is next.
  if (customerEmail && next !== prev) {
    if (isConfirming) {
      const itemRows = await db
        .select({
          qty: orderItems.qty,
          name: orderItems.nameSnapshot,
          unitPriceMmkSnapshot: orderItems.unitPriceMmkSnapshot,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, id))
      await mailOrAlert({
        to: customerEmail,
        subject: `Order ${shortOrderId(id)} - ${kind === 'cod' ? 'order confirmed' : 'payment confirmed'}`,
        react: OrderInvoice({
          orderId: id,
          orderUrl: orderUrl(id),
          total,
          subtotal: formatMmk(Number(order.subtotalMmk)),
          deliveryFee: formatMmk(Number(order.deliveryFeeMmk)),
          method: method?.name ?? order.paymentMethodId,
          kind,
          placedAt,
          updatedAt: movedAt,
          items: itemRows.map((it) => ({
            qty: it.qty,
            name: it.name,
            lineTotal: formatMmk(Number(it.unitPriceMmkSnapshot) * it.qty),
          })),
        }),
      }, `order ${shortOrderId(id)} invoice`)
    } else if (isRejecting && reason && patch.expiresAt) {
      await mailOrAlert({
        to: customerEmail,
        subject: `Order ${shortOrderId(id)} - slip sent back, action needed`,
        react: SlipRejected({
          orderId: id,
          orderUrl: orderUrl(id),
          total,
          method: method?.name ?? order.paymentMethodId,
          reason,
          deadline: orderTimestamp(patch.expiresAt.toISOString()),
        }),
      }, `order ${shortOrderId(id)} slip sent back (customer)`)
    } else if (next === 'delivered') {
      await mailOrAlert({
        to: customerEmail,
        subject: `Order ${shortOrderId(id)} - delivered`,
        react: OrderDelivered({
          orderId: id,
          orderUrl: orderUrl(id),
          kind,
          placedAt,
          updatedAt: movedAt,
        }),
      }, `order ${shortOrderId(id)} delivered`)
    } else if (next === 'cancelled') {
      await mailOrAlert({
        to: customerEmail,
        subject: `Order ${shortOrderId(id)} - cancelled`,
        react: OrderCancelled({
          orderId: id,
          orderUrl: orderUrl(id),
          shopUrl: shopUrl(),
          reason: patch.notes ?? 'Cancelled by TechX.',
        }),
      }, `order ${shortOrderId(id)} cancelled`)
    }
  }

  return ok({ ok: true })
}
