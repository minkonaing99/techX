import { NextResponse } from 'next/server'
import { fail, rateLimited } from '@/lib/api-response'
import { currentRole, requireAdmin } from '@/lib/admin-guard'
import { getOrdersForExport } from '@/lib/admin-sales'
import { toCsv } from '@/lib/csv'
import { clientKey, rateLimit } from '@/lib/rate-limit'
import { formatMmDateTime, parseReportRange } from '@/lib/sales-report'

/*
 * Orders placed between two Myanmar dates, inclusive, as a CSV download for the
 * owner's own bookkeeping. Customer names, emails and phones are in it, so it
 * is admin only and never cached; street addresses and maps links are left out.
 */

export const dynamic = 'force-dynamic'

const HEADER = [
  'order_id',
  'placed_at_mm',
  'status',
  'payment_method',
  'payment_kind',
  'subtotal_mmk',
  'delivery_fee_mmk',
  'total_mmk',
  'customer_name',
  'customer_email',
  'ship_recipient',
  'ship_phone',
  'ship_division',
  'ship_township',
  'payment_tx_ref',
  'items',
]

export async function GET(req: Request): Promise<NextResponse> {
  // Before the admin check, so a flood never reaches the session lookup.
  const limit = rateLimit({ key: clientKey(req, 'admin:report-csv'), limit: 20, windowMs: 60 * 1000 })
  if (!limit.allowed) return rateLimited('Too many exports.', limit.retryAfterSeconds)

  const denied = await requireAdmin()
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const range = parseReportRange(from, to)
  if ('error' in range) return fail('VALIDATION_ERROR', range.error, 400)

  const orders = await getOrdersForExport(range.start, range.endExclusive)
  // A bulk export of customer details leaves a trace: who, which range, how
  // many rows. Never the rows themselves.
  console.info('[admin] orders exported', (await currentRole())?.userId ?? 'unknown', from, to, orders.length)

  const rows = orders.map((o) => [
    o.id,
    formatMmDateTime(o.placedAt),
    o.status,
    o.paymentMethodId,
    o.paymentKind,
    o.subtotalMmk,
    o.deliveryFeeMmk,
    o.totalMmk,
    o.customerName,
    o.customerEmail,
    o.shipRecipient,
    o.shipPhone,
    o.shipDivisionName,
    o.shipTownship,
    o.paymentTxRef,
    o.items,
  ])

  return new NextResponse(toCsv(HEADER, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // Both dates passed the YYYY-MM-DD check, so they are safe in the header.
      'Content-Disposition': `attachment; filename="orders-${from}-to-${to}.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
