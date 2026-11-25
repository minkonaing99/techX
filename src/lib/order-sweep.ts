import { and, eq, gt, isNull, lt, lte } from 'drizzle-orm'
import { db } from '@/db'
import { orders } from '@/db/schema/orders'
import { paymentMethods, type MethodKind } from '@/db/schema/payment-methods'
import { users } from '@/db/schema/auth'
import { sendMail } from '@/lib/mail'
import { mailOrAlert } from '@/lib/notify'
import { adminOrderUrl, orderUrl, shopUrl } from '@/lib/links'
import { shortOrderId } from '@/lib/order-status'
import { reportError } from '@/lib/report-error'
import { sendTelegram } from '@/lib/telegram'
import { holdsStock } from '@/lib/order-transitions'
import { orderStockLines, returnStock } from '@/lib/stock'
import { OrderCancelled } from '@emails/order-cancelled'
import { PaymentReminder } from '@emails/payment-reminder'
import { formatMmk } from '@/lib/money'
import { orderTimestamp } from '@/lib/relative-time'

/*
 * Releases orders still in `pending_payment` past `expires_at` (placed + 24h),
 * wallet and COD alike, returning the stock of those that reserved it at
 * checkout.
 *
 * Runs inside the Next server (started from `src/instrumentation.ts`) because
 * the host has no way to run a script: production installs carry no `tsx` and
 * no `.env.local`.
 */

export const SWEEP_INTERVAL_MS = 60 * 60 * 1000

const NOTICE: Record<MethodKind, { subject: string; reason: string }> = {
  wallet: {
    subject: 'cancelled, payment not received',
    reason: 'Payment was not received within 24 hours, so the order was released automatically.',
  },
  cod: {
    subject: 'cancelled, not confirmed',
    reason: 'We could not confirm your order by phone within 24 hours, so it was released automatically.',
  },
}

interface ExpiredOrder {
  id: string
  kind: MethodKind
  email: string
  stockReserved: boolean
}

async function cancelOne(order: ExpiredOrder): Promise<{ cancelled: boolean; emailed: boolean }> {
  // Conditional on the status still being pending: a slip upload, a customer
  // cancel or an admin confirm may have landed since the select. Only the
  // writer that made the change returns stock and sends the email. No
  // revalidateTag here: it throws outside a request, and the catalog cache
  // expires within a minute anyway.
  const won = await db.transaction(async (tx) => {
    const [header] = await tx
      .update(orders)
      .set({ status: 'cancelled' })
      .where(and(eq(orders.id, order.id), eq(orders.status, 'pending_payment')))
    if (header.affectedRows !== 1) return false
    if (holdsStock('pending_payment', order.stockReserved)) {
      await returnStock(tx, await orderStockLines(tx, order.id))
    }
    return true
  })
  if (!won) return { cancelled: false, emailed: false }

  // The cancel is committed. Nothing about the email - building it included -
  // may make it look otherwise.
  const notice = NOTICE[order.kind]
  const sent = await Promise.resolve()
    .then(() =>
      mailOrAlert({
        to: order.email,
        subject: `Order ${shortOrderId(order.id)} - ${notice.subject}`,
        react: OrderCancelled({
          orderId: order.id,
          orderUrl: orderUrl(order.id),
          shopUrl: shopUrl(),
          reason: notice.reason,
        }),
      }, `order ${shortOrderId(order.id)} auto-cancelled (customer)`),
    )
    // Only building the email can land here; mailOrAlert itself never throws.
    .catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err)
      console.error('[sweep] cancel notice not built', shortOrderId(order.id), reason)
      void sendTelegram(`Email not sent: order ${shortOrderId(order.id)} auto-cancelled (customer)\n${reason}`)
      return false
    })
  return { cancelled: true, emailed: sent }
}

export interface SweepResult {
  cancelled: number
  emailed: number
  /** Orders whose cancellation threw. */
  failed: number
}

export async function cancelExpiredOrders(now: Date = new Date()): Promise<SweepResult> {
  const expired = await db
    .select({
      id: orders.id,
      kind: paymentMethods.kind,
      email: users.email,
      stockReserved: orders.stockReserved,
    })
    .from(orders)
    .innerJoin(paymentMethods, eq(paymentMethods.id, orders.paymentMethodId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(orders.status, 'pending_payment'), lt(orders.expiresAt, now)))

  let cancelled = 0
  let emailed = 0
  let failed = 0
  let firstError: unknown
  // One order failing (a lock timeout, say) must not cost the rest of the run.
  for (const order of expired) {
    try {
      const result = await cancelOne(order)
      if (result.cancelled) cancelled += 1
      if (result.emailed) emailed += 1
    } catch (err) {
      failed += 1
      firstError ??= err
    }
  }
  // One alert per run: each failure's message names its own order, so the
  // reporter's throttle would let a lock storm through one message per order.
  if (failed > 0) {
    await reportError(firstError, { path: `order-sweep: ${failed} of ${expired.length} orders failed` })
  }
  return { cancelled, emailed, failed }
}

const HOUR_MS = 60 * 60 * 1000

/**
 * A slip awaiting review never expires, and its order holds stock until the
 * owner acts - by design, so a customer who really paid is never cancelled for
 * the owner's absence. Instead the owner is nudged: one message naming every
 * slip that has just completed another whole day of waiting. Run hourly, each
 * slip appears once a day. The wait is measured from the order's last change,
 * which for a slip is its upload unless the owner edited it since.
 */
export async function remindStaleSlips(now: Date = new Date()): Promise<void> {
  const waiting = await db
    .select({ id: orders.id, updatedAt: orders.updatedAt })
    .from(orders)
    .where(and(eq(orders.status, 'payment_submitted'), lt(orders.updatedAt, new Date(now.getTime() - 24 * HOUR_MS))))

  const due = waiting
    .map((o) => ({ id: o.id, hours: Math.floor((now.getTime() - o.updatedAt.getTime()) / HOUR_MS) }))
    .filter((o) => o.hours >= 24 && o.hours % 24 === 0)
  if (due.length === 0) return

  const lines = due.map((o) => {
    const days = o.hours / 24
    return `${shortOrderId(o.id)} - waiting ${days} day${days === 1 ? '' : 's'} - ${adminOrderUrl(o.id)}`
  })
  const text = [`Slips waiting for review (stock held until you act):`, ...lines].join('\n')
  // The one owner alert that goes out on Telegram alone, and the paid slip it
  // names is what the owner must not miss: fall back to email. Plain sendMail,
  // not mailOrAlert - that would only retry the Telegram that just failed.
  if (await sendTelegram(text)) return
  const ownerEmail = process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] ?? 'admin@localhost'
  await sendMail({ to: ownerEmail, subject: 'Slips waiting for review', text })
    .then(({ delivered }) => {
      if (!delivered) console.error('[sweep] slip reminder not delivered: SMTP not configured')
    })
    .catch((err: unknown) =>
      console.error('[sweep] slip reminder not delivered', err instanceof Error ? err.message : err),
    )
}

/** How long before the deadline an unpaid wallet order gets its one reminder. */
const REMINDER_LEAD_MS = 6 * HOUR_MS

interface UnpaidOrder {
  id: string
  email: string
  totalMmk: number
  expiresAt: Date
  method: string
}

/** Undo a claim whose email did not go out, so the next sweep tries again. */
async function releaseReminder(id: string, claimedAt: Date): Promise<void> {
  await db
    .update(orders)
    .set({ paymentReminderSentAt: null })
    .where(and(eq(orders.id, id), eq(orders.paymentReminderSentAt, claimedAt)))
}

/**
 * Claim first, conditional on the deadline read, so two sweeps never send two
 * reminders and a slip sent back mid-sweep (new deadline) is not reminded with
 * the old one. A send that fails releases the claim for the next sweep.
 */
async function remindOne(order: UnpaidOrder, now: Date): Promise<boolean> {
  // Whole seconds: the column is a plain TIMESTAMP, which drops milliseconds
  // on write, and the release has to match the value actually stored.
  const claimedAt = new Date(Math.floor(now.getTime() / 1000) * 1000)
  const [header] = await db
    .update(orders)
    .set({ paymentReminderSentAt: claimedAt })
    .where(
      and(
        eq(orders.id, order.id),
        eq(orders.status, 'pending_payment'),
        isNull(orders.paymentReminderSentAt),
        eq(orders.expiresAt, order.expiresAt),
        // Checked now, not at the batch's read: slow sends earlier in the loop
        // can carry this order past its deadline.
        gt(orders.expiresAt, new Date()),
      ),
    )
  if (header.affectedRows !== 1) return false

  const short = shortOrderId(order.id)
  let delivered: boolean
  try {
    delivered = await mailOrAlert({
      to: order.email,
      subject: `Order ${short} - payment reminder`,
      react: PaymentReminder({
        orderId: order.id,
        orderUrl: orderUrl(order.id),
        total: formatMmk(Number(order.totalMmk)),
        method: order.method,
        deadline: orderTimestamp(order.expiresAt.toISOString()),
      }),
    }, `order ${short} payment reminder (customer)`)
  } catch (err) {
    // Only building the email can throw; mailOrAlert never does.
    await releaseReminder(order.id, claimedAt)
    throw err
  }
  if (!delivered) await releaseReminder(order.id, claimedAt)
  return delivered
}

/**
 * One reminder per deadline to wallet orders still unpaid within six hours of
 * it. The window is the whole six hours, not one hour of it, so a reminder
 * missed while the app was down still goes out; the column keeps it to one.
 */
export async function remindUnpaidOrders(now: Date = new Date()): Promise<number> {
  const due = await db
    .select({
      id: orders.id,
      email: users.email,
      totalMmk: orders.totalMmk,
      expiresAt: orders.expiresAt,
      method: paymentMethods.name,
    })
    .from(orders)
    .innerJoin(paymentMethods, eq(paymentMethods.id, orders.paymentMethodId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(
      and(
        eq(orders.status, 'pending_payment'),
        eq(paymentMethods.kind, 'wallet'),
        isNull(orders.paymentReminderSentAt),
        gt(orders.expiresAt, now),
        lte(orders.expiresAt, new Date(now.getTime() + REMINDER_LEAD_MS)),
      ),
    )

  let sent = 0
  let failed = 0
  let firstError: unknown
  for (const order of due) {
    try {
      if (await remindOne(order, now)) sent += 1
    } catch (err) {
      failed += 1
      firstError ??= err
    }
  }
  if (failed > 0) {
    await reportError(firstError, { path: `payment-reminder: ${failed} of ${due.length} orders failed` })
  }
  return sent
}

const globalForSweep = globalThis as unknown as {
  __orderSweepTimer?: ReturnType<typeof setInterval>
  /** When the timer started, and when a sweep last finished cleanly (ms). */
  __orderSweepStartedAt?: number
  __orderSweepLastOkAt?: number
}

/** Two missed hourly sweeps in a row. */
const SWEEP_STALE_MS = 2 * SWEEP_INTERVAL_MS

// SMTP has no timeout, so a slow sweep can outlast the interval. Overlapping
// would not double-email (the update is conditional), only waste the work.
let running = false

async function sweepOnce(): Promise<void> {
  if (running) return
  running = true
  try {
    const result = await cancelExpiredOrders()
    await remindStaleSlips()
    await remindUnpaidOrders()
    // A run where cancellations failed and none went through is not clean:
    // held stock is stuck, and health must say so. Reminder failures hold
    // no stock, so they do not count.
    if (!(result.failed > 0 && result.cancelled === 0)) {
      globalForSweep.__orderSweepLastOkAt = Date.now()
    }
  } catch (err) {
    await reportError(err, { path: 'order-sweep' })
  } finally {
    running = false
  }
}

/** Sweeps now, then every `SWEEP_INTERVAL_MS`. A second call is a no-op. */
export function startOrderSweep(): void {
  if (globalForSweep.__orderSweepTimer) return
  globalForSweep.__orderSweepStartedAt = Date.now()
  void sweepOnce()
  // `unref` so the timer never holds a process open that is otherwise done.
  globalForSweep.__orderSweepTimer = setInterval(() => void sweepOnce(), SWEEP_INTERVAL_MS).unref()
}

export function stopOrderSweep(): void {
  clearInterval(globalForSweep.__orderSweepTimer)
  globalForSweep.__orderSweepTimer = undefined
  globalForSweep.__orderSweepStartedAt = undefined
  globalForSweep.__orderSweepLastOkAt = undefined
}

/**
 * The heartbeat `/api/v1/health` reads: the timer is running and a sweep has
 * finished cleanly within two intervals (or the timer started that recently).
 * A stopped sweep cannot report itself, and held stock is then never released.
 */
export function sweepIsCurrent(now: number = Date.now()): boolean {
  if (!globalForSweep.__orderSweepTimer) return false
  const last = globalForSweep.__orderSweepLastOkAt ?? globalForSweep.__orderSweepStartedAt
  return last !== undefined && now - last <= SWEEP_STALE_MS
}
