import { and, eq, sql } from 'drizzle-orm'
import type { db } from '@/db'
import { orderItems } from '@/db/schema/orders'
import { products } from '@/db/schema/products'
import { mailOrAlert } from '@/lib/notify'
import { adminProductsUrl } from '@/lib/links'
import { LowStockAlert } from '@emails/low-stock-alert'

/*
 * Every stock movement goes through here, so every transaction locks product
 * rows in the same order. Two transactions that each hold one product and want
 * the other's would otherwise deadlock - a checkout against an admin confirm,
 * say, with the same two products in opposite order.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface StockLine {
  productId: string
  qty: number
}

export interface LowStock {
  id: string
  remaining: number
  name: string
}

const LOW_STOCK_DEFAULT = 3

export class OutOfStockError extends Error {
  constructor(readonly productId: string) {
    super(`Not enough stock for ${productId}.`)
    this.name = 'OutOfStockError'
  }
}

function inLockOrder(lines: readonly StockLine[]): StockLine[] {
  return [...lines].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))
}

export async function orderStockLines(tx: Tx, orderId: string): Promise<StockLine[]> {
  return tx
    .select({ productId: orderItems.productId, qty: orderItems.qty })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
}

/**
 * Takes each line's quantity, refusing - by throwing `OutOfStockError`, which
 * rolls the caller's transaction back - the first line the shop cannot fill.
 * The guard is in the UPDATE itself, so two takers cannot both pass a read.
 */
export async function takeStock(tx: Tx, lines: readonly StockLine[]): Promise<LowStock[]> {
  const low: LowStock[] = []
  for (const line of inLockOrder(lines)) {
    const [header] = await tx
      .update(products)
      .set({ stockQty: sql`${products.stockQty} - ${line.qty}` })
      .where(and(eq(products.id, line.productId), sql`${products.stockQty} >= ${line.qty}`))
    if (header.affectedRows === 0) throw new OutOfStockError(line.productId)

    const [row] = await tx
      .select({ name: products.name, stockQty: products.stockQty, threshold: products.lowStockThreshold })
      .from(products)
      .where(eq(products.id, line.productId))
      .limit(1)
    if (row && row.stockQty <= (row.threshold ?? LOW_STOCK_DEFAULT)) {
      low.push({ id: line.productId, remaining: row.stockQty, name: row.name })
    }
  }
  return low
}

/** Puts each line's quantity back. No `is_active` guard: a retired product's units are still on the shelf. */
export async function returnStock(tx: Tx, lines: readonly StockLine[]): Promise<void> {
  for (const line of inLockOrder(lines)) {
    await tx
      .update(products)
      .set({ stockQty: sql`${products.stockQty} + ${line.qty}` })
      .where(eq(products.id, line.productId))
  }
}

/**
 * Adds a delivery, only over the stock the owner previewed: an order taken in
 * between would make the previewed total wrong. False when the stock moved or
 * the product is gone - the caller reads the row back to tell which.
 */
export async function restock(tx: Tx, productId: string, add: number, stockWas: number): Promise<boolean> {
  const [header] = await tx
    .update(products)
    .set({ stockQty: sql`${products.stockQty} + ${add}` })
    .where(and(eq(products.id, productId), eq(products.stockQty, stockWas)))
  return header.affectedRows === 1
}

export async function sendLowStockAlerts(low: readonly LowStock[]): Promise<void> {
  const ownerEmail = process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] ?? 'admin@localhost'
  for (const b of low) {
    await mailOrAlert({
      to: ownerEmail,
      subject: b.remaining <= 0 ? `Sold out: ${b.name}` : `Low stock: ${b.name}`,
      react: LowStockAlert({ productName: b.name, remaining: b.remaining, adminUrl: adminProductsUrl() }),
    }, `low-stock alert: ${b.name}`)
  }
}
