import 'server-only'
import { and, asc, count, eq, gte, inArray, lt, sum } from 'drizzle-orm'
import { db } from '@/db'
import { orderItems, orders, type OrderStatus } from '@/db/schema/orders'
import { paymentMethods } from '@/db/schema/payment-methods'
import { users } from '@/db/schema/auth'
import {
  SOLD,
  dailyRevenue,
  mmDayStart,
  reportWindowStart,
  summarizeSales,
  topProducts,
  type DayRevenue,
  type SalesSummary,
  type TopProduct,
} from '@/lib/sales-report'

/*
 * The reads behind the /admin sales section and the orders CSV. The SQL only
 * filters; every sum and day bucket is worked out in src/lib/sales-report.ts.
 */

export interface SalesReport extends SalesSummary {
  daily: DayRevenue[]
  top: TopProduct[]
  codToCollect: { orders: number; totalMmk: number }
}

export async function getSalesReport(now: Date = new Date()): Promise<SalesReport> {
  const [sales, [cod], lines] = await Promise.all([
    db
      .select({ totalMmk: orders.totalMmk, placedAt: orders.placedAt, status: orders.status })
      .from(orders)
      .where(and(inArray(orders.status, SOLD), gte(orders.placedAt, reportWindowStart(now)))),
    // Agreed by phone, cash still with the courier: no date limit.
    db
      .select({ orders: count(), totalMmk: sum(orders.totalMmk) })
      .from(orders)
      .innerJoin(paymentMethods, eq(paymentMethods.id, orders.paymentMethodId))
      .where(and(eq(orders.status, 'confirmed'), eq(paymentMethods.kind, 'cod'))),
    db
      .select({
        productId: orderItems.productId,
        nameSnapshot: orderItems.nameSnapshot,
        qty: orderItems.qty,
        unitPriceMmkSnapshot: orderItems.unitPriceMmkSnapshot,
        placedAt: orders.placedAt,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(inArray(orders.status, SOLD), gte(orders.placedAt, mmDayStart(now, 29)))),
  ])

  const rows = sales.map((r) => ({ ...r, totalMmk: Number(r.totalMmk) }))
  return {
    ...summarizeSales(rows, now),
    daily: dailyRevenue(rows, now),
    top: topProducts(lines.map((l) => ({ ...l, unitPriceMmkSnapshot: Number(l.unitPriceMmkSnapshot) }))),
    codToCollect: { orders: Number(cod?.orders ?? 0), totalMmk: Number(cod?.totalMmk ?? 0) },
  }
}

export interface ExportOrder {
  id: string
  placedAt: Date
  status: OrderStatus
  paymentMethodId: string
  paymentKind: string | null
  subtotalMmk: number
  deliveryFeeMmk: number
  totalMmk: number
  customerName: string | null
  customerEmail: string | null
  shipRecipient: string | null
  shipPhone: string | null
  shipDivisionName: string | null
  shipTownship: string | null
  paymentTxRef: string | null
  items: string
}

/** Every order placed in [start, endExclusive), oldest first, with "2x Name; 1x Name" items. */
export async function getOrdersForExport(start: Date, endExclusive: Date): Promise<ExportOrder[]> {
  const rows = await db
    .select({
      id: orders.id,
      placedAt: orders.placedAt,
      status: orders.status,
      paymentMethodId: orders.paymentMethodId,
      paymentKind: paymentMethods.kind,
      subtotalMmk: orders.subtotalMmk,
      deliveryFeeMmk: orders.deliveryFeeMmk,
      totalMmk: orders.totalMmk,
      customerName: users.name,
      customerEmail: users.email,
      shipRecipient: orders.shipRecipient,
      shipPhone: orders.shipPhone,
      shipDivisionName: orders.shipDivisionName,
      shipTownship: orders.shipTownship,
      paymentTxRef: orders.paymentTxRef,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .leftJoin(paymentMethods, eq(paymentMethods.id, orders.paymentMethodId))
    .where(and(gte(orders.placedAt, start), lt(orders.placedAt, endExclusive)))
    .orderBy(asc(orders.placedAt))
  if (rows.length === 0) return []

  const lines = await db
    .select({ orderId: orderItems.orderId, qty: orderItems.qty, name: orderItems.nameSnapshot })
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)))
  const itemsByOrder = new Map<string, string[]>()
  for (const l of lines) {
    itemsByOrder.set(l.orderId, [...(itemsByOrder.get(l.orderId) ?? []), `${l.qty}x ${l.name}`])
  }

  return rows.map((r) => ({
    ...r,
    subtotalMmk: Number(r.subtotalMmk),
    deliveryFeeMmk: Number(r.deliveryFeeMmk),
    totalMmk: Number(r.totalMmk),
    items: (itemsByOrder.get(r.id) ?? []).join('; '),
  }))
}
