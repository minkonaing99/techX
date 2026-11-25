import type { OrderStatus } from '@/db/schema/orders'

/*
 * Sales figures for /admin, as pure functions over rows read by
 * src/lib/admin-sales.ts. Days are Myanmar calendar days (UTC+6:30, no DST),
 * bucketed here rather than in SQL so the database session time zone never
 * matters. An order counts on the day it was placed: there is no confirmation
 * date column.
 */

const MM_OFFSET_MS = 390 * 60_000
const DAY_MS = 24 * 60 * 60_000
const MAX_RANGE_DAYS = 366
/** Money received, or a COD sale agreed by phone. The SQL and the sums both use this. */
export const SOLD: OrderStatus[] = ['confirmed', 'delivered']

export interface SaleRow {
  totalMmk: number
  placedAt: Date
  status: OrderStatus
}

export interface ItemLine {
  productId: string
  nameSnapshot: string
  qty: number
  unitPriceMmkSnapshot: number
  placedAt: Date
}

export interface SalesSummary {
  todayMmk: number
  d7Mmk: number
  d30Mmk: number
  monthMmk: number
  orders30: number
  avgOrder30: number
}

export interface DayRevenue {
  day: string
  revenueMmk: number
  orders: number
}

export interface TopProduct {
  productId: string
  name: string
  units: number
  revenueMmk: number
}

/** 'YYYY-MM-DD' of the Myanmar day `d` falls on. */
export function mmDayKey(d: Date): string {
  return new Date(d.getTime() + MM_OFFSET_MS).toISOString().slice(0, 10)
}

/** Myanmar midnight `daysBack` days before today, as a UTC instant. */
export function mmDayStart(now: Date, daysBack = 0): Date {
  const local = new Date(now.getTime() + MM_OFFSET_MS)
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysBack)
  return new Date(midnight - MM_OFFSET_MS)
}

export function mmMonthStart(now: Date): Date {
  const local = new Date(now.getTime() + MM_OFFSET_MS)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - MM_OFFSET_MS)
}

/** Earliest instant any figure needs: the 30-day start, or the 1st of the month on the 31st. */
export function reportWindowStart(now: Date): Date {
  const d30 = mmDayStart(now, 29)
  const month = mmMonthStart(now)
  return month < d30 ? month : d30
}

/** 'YYYY-MM-DD HH:mm', Myanmar time. */
export function formatMmDateTime(d: Date): string {
  return new Date(d.getTime() + MM_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')
}

function sold(rows: readonly SaleRow[], now: Date): readonly SaleRow[] {
  return rows.filter((r) => SOLD.includes(r.status) && r.placedAt <= now)
}

function sumSince(rows: readonly SaleRow[], start: Date): number {
  return rows.filter((r) => r.placedAt >= start).reduce((sum, r) => sum + r.totalMmk, 0)
}

export function summarizeSales(rows: readonly SaleRow[], now: Date): SalesSummary {
  const done = sold(rows, now)
  const last30 = done.filter((r) => r.placedAt >= mmDayStart(now, 29))
  const d30Mmk = last30.reduce((sum, r) => sum + r.totalMmk, 0)
  return {
    todayMmk: sumSince(done, mmDayStart(now)),
    d7Mmk: sumSince(done, mmDayStart(now, 6)),
    d30Mmk,
    monthMmk: sumSince(done, mmMonthStart(now)),
    orders30: last30.length,
    avgOrder30: last30.length ? Math.round(d30Mmk / last30.length) : 0,
  }
}

/** One entry per Myanmar day, oldest first, days without sales included. */
export function dailyRevenue(rows: readonly SaleRow[], now: Date, days = 30): DayRevenue[] {
  const keys = Array.from({ length: days }, (_, i) => mmDayKey(mmDayStart(now, days - 1 - i)))
  const empty = Object.fromEntries(keys.map((k) => [k, { revenueMmk: 0, orders: 0 }]))
  const byDay = sold(rows, now).reduce<Record<string, { revenueMmk: number; orders: number }>>((acc, r) => {
    const key = mmDayKey(r.placedAt)
    const day = acc[key]
    return day ? { ...acc, [key]: { revenueMmk: day.revenueMmk + r.totalMmk, orders: day.orders + 1 } } : acc
  }, empty)
  return keys.map((day) => ({ day, ...byDay[day]! }))
}

export function topProducts(lines: readonly ItemLine[], limit = 5): TopProduct[] {
  const byProduct = lines.reduce<Record<string, TopProduct & { latest: number }>>((acc, l) => {
    const prev = acc[l.productId]
    const at = l.placedAt.getTime()
    const newer = !prev || at >= prev.latest
    return {
      ...acc,
      [l.productId]: {
        productId: l.productId,
        name: newer ? l.nameSnapshot : prev.name,
        latest: newer ? at : prev.latest,
        units: (prev?.units ?? 0) + l.qty,
        revenueMmk: (prev?.revenueMmk ?? 0) + l.qty * l.unitPriceMmkSnapshot,
      },
    }
  }, {})
  return Object.values(byProduct)
    .sort((a, b) => b.units - a.units || b.revenueMmk - a.revenueMmk || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ productId, name, units, revenueMmk }) => ({ productId, name, units, revenueMmk }))
}

/** A real calendar date in 'YYYY-MM-DD' form, as the UTC midnight of that date. */
function parseDay(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const t = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value ? t : null
}

/** Inclusive Myanmar dates for the CSV export, at most 366 days. */
export function parseReportRange(
  from: string | null,
  to: string | null,
): { start: Date; endExclusive: Date } | { error: string } {
  const a = parseDay(from)
  const b = parseDay(to)
  if (a === null || b === null) return { error: 'Use dates like 2026-10-23.' }
  if (a > b) return { error: 'The start date is after the end date.' }
  if ((b - a) / DAY_MS + 1 > MAX_RANGE_DAYS) return { error: `At most ${MAX_RANGE_DAYS} days at a time.` }
  return { start: new Date(a - MM_OFFSET_MS), endExclusive: new Date(b + DAY_MS - MM_OFFSET_MS) }
}
