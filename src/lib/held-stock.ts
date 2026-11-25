import { and, eq, inArray, sum } from 'drizzle-orm'
import { db } from '@/db'
import { orderItems, orders } from '@/db/schema/orders'

/**
 * Units each product has set aside for orders not yet paid for, by product id.
 * Confirmed orders are left out: under either stock rule their units are gone
 * for good, so they are already outside `stock_qty` and need no explaining.
 */
export async function heldByProduct(): Promise<Record<string, number>> {
  const rows = await db
    .select({ productId: orderItems.productId, held: sum(orderItems.qty) })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.stockReserved, true), inArray(orders.status, ['pending_payment', 'payment_submitted'])))
    .groupBy(orderItems.productId)
  // MySQL hands SUM back as a decimal string.
  return Object.fromEntries(rows.map((r) => [r.productId, Number(r.held ?? 0)]))
}
