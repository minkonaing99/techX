import { asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { orderItems, orders, type OrderStatus } from '@/db/schema/orders'
import { paymentMethods, type MethodKind } from '@/db/schema/payment-methods'

/** One row of a customer's order list: enough to tell orders apart without opening them. */
export interface AccountOrder {
  id: string
  status: OrderStatus
  totalMmk: number
  placedAt: string
  methodName: string
  methodKind: MethodKind
  /** `Kestrel 75 + 1 more` */
  items: string
}

/** The full list stops here: each order also loads its items. */
export const ORDERS_SHOWN = 100

interface Line {
  name: string
  qty: number
}

/** The first item, with its quantity when more than one, and how many other lines there are. */
export function itemsSummary(lines: readonly Line[]): string {
  const [first, ...rest] = lines
  if (!first) return ''
  const name = first.qty > 1 ? `${first.qty} × ${first.name}` : first.name
  return rest.length > 0 ? `${name} + ${rest.length} more` : name
}

/** A customer's orders, newest first (at most `limit`), each with its payment method and items summary. */
export async function loadAccountOrders(userId: string, limit = ORDERS_SHOWN): Promise<AccountOrder[]> {
  const query = db
    .select({
      id: orders.id,
      status: orders.status,
      totalMmk: orders.totalMmk,
      placedAt: orders.placedAt,
      methodName: paymentMethods.name,
      methodKind: paymentMethods.kind,
    })
    .from(orders)
    .innerJoin(paymentMethods, eq(paymentMethods.id, orders.paymentMethodId))
    .where(eq(orders.userId, userId))
    // The id breaks ties, so the overview and the full list agree on order.
    .orderBy(desc(orders.placedAt), desc(orders.id))
  const rows = await query.limit(limit)
  if (rows.length === 0) return []

  const lines = await db
    .select({ orderId: orderItems.orderId, name: orderItems.nameSnapshot, qty: orderItems.qty })
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)))
    .orderBy(asc(orderItems.id))
  const byOrder = new Map<string, Line[]>()
  for (const l of lines) byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), { name: l.name, qty: l.qty }])

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    totalMmk: Number(r.totalMmk),
    placedAt: r.placedAt.toISOString(),
    methodName: r.methodName,
    methodKind: r.methodKind,
    items: itemsSummary(byOrder.get(r.id) ?? []),
  }))
}
