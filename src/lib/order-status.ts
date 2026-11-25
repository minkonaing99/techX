import type { OrderStatus } from '@/db/schema/orders'
import type { MethodKind } from '@/db/schema/payment-methods'
import { formatMmk } from '@/lib/money'

// Re-exported so the consumers of these functions get the argument type from
// the same import as the function itself.
export type { MethodKind }

/** Orders still on their way to the customer: not delivered, not cancelled. */
export const OPEN_ORDER_STATUSES = [
  'pending_payment',
  'payment_submitted',
  'confirmed',
] as const satisfies readonly OrderStatus[]

/**
 * Customer-facing status wording.
 *
 * `pending_payment` means two different things depending on how the order is
 * paid: a wallet customer owes a transfer, a COD customer owes nothing until
 * the courier arrives and is simply waiting on our confirmation call. Never
 * show the raw enum to a customer.
 */
export function customerStatusLabel(status: OrderStatus, kind: MethodKind): string {
  switch (status) {
    case 'pending_payment':
      return kind === 'cod' ? 'Awaiting confirmation' : 'Awaiting payment'
    case 'payment_submitted':
      return 'Slip received'
    case 'confirmed':
      return kind === 'cod' ? 'Confirmed - pay on delivery' : 'Confirmed'
    case 'delivered':
      return 'Delivered'
    case 'cancelled':
      return 'Cancelled'
  }
}

/**
 * The Payment row on the order pages. A wallet order only says the money
 * arrived once the shop has confirmed it; a cancelled one makes no claim
 * either way, since it may have been cancelled before or after a transfer.
 */
export function paymentNote(status: OrderStatus, kind: MethodKind, totalMmk: number): string {
  if (kind === 'cod') return 'Pay the courier when the parcel arrives.'
  switch (status) {
    case 'pending_payment':
    case 'payment_submitted':
      return 'Bank transfer or mobile wallet, checked by our team.'
    case 'confirmed':
    case 'delivered':
      return `Payment received: ${formatMmk(totalMmk)}, checked by our team.`
    case 'cancelled':
      return 'Bank transfer or mobile wallet.'
  }
}

/**
 * The status in an order list, where the payment method is shown beside it:
 * "Cash on delivery · Confirmed - pay on delivery" would say it twice.
 */
export function listStatusLabel(status: OrderStatus, kind: MethodKind): string {
  return status === 'confirmed' && kind === 'cod' ? 'Confirmed' : customerStatusLabel(status, kind)
}

/** The one state where the customer owes an action: a wallet transfer not yet sent. */
export function owesPayment(status: OrderStatus, kind: MethodKind): boolean {
  return status === 'pending_payment' && kind === 'wallet'
}

/**
 * The customer-facing order reference. Order ids are UUIDs, which wrap on a
 * phone and read as debug output; these 8 characters are what the order page,
 * every subject line and every email body show.
 */
export function shortOrderId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

export type ProgressState = 'done' | 'current' | 'todo'

export interface ProgressStep {
  /** The order status this step represents - also drives progress position. */
  status: OrderStatus
  label: string
  state: ProgressState
}

/**
 * Wallet orders carry an extra slip-verification step. COD orders skip
 * straight from placed to confirmed, because the shop confirms by phone.
 */
const WALLET_RAIL: readonly Omit<ProgressStep, 'state'>[] = [
  { status: 'pending_payment', label: 'Order placed' },
  { status: 'payment_submitted', label: 'Payment sent' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'delivered', label: 'Delivered' },
]

const COD_RAIL: readonly Omit<ProgressStep, 'state'>[] = [
  { status: 'pending_payment', label: 'Order placed' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'delivered', label: 'Delivered' },
]

/**
 * The order rail, shared by the order page and the customer emails so the two
 * can never drift. Cancelled returns no steps: it is progress stopping, not a
 * stage of it, and a rail would tell the customer the order is still moving.
 */
export function progressSteps(status: OrderStatus, kind: MethodKind): ProgressStep[] {
  if (status === 'cancelled') return []

  const rail = kind === 'cod' ? COD_RAIL : WALLET_RAIL
  // A wallet-only status on a COD order is a bad row, not a later stage. Fall
  // back to the first step rather than marking the whole rail done.
  const current = Math.max(
    0,
    rail.findIndex((s) => s.status === status),
  )

  return rail.map((step, i) => ({
    ...step,
    state: i < current ? 'done' : i === current ? 'current' : 'todo',
  }))
}

/**
 * One line of "what happens next", or null when nothing is expected of anyone.
 * `deadline` is the order's formatted `expires_at`. A slip awaiting review is
 * never swept (`order-sweep.ts`), which is what the wallet lines promise. There
 * is no dispatched status, so a confirmed order is not called "on its way".
 */
export function customerStatusHint(
  status: OrderStatus,
  kind: MethodKind,
  deadline?: string,
): string | null {
  if (status === 'pending_payment') {
    if (kind === 'cod') {
      return 'We will call to confirm this order within 3 hours. Pay the courier in cash on delivery.'
    }
    const by = deadline ? `by ${deadline} Myanmar time` : 'within 24 hours of placing the order'
    return `Transfer the total, then upload your payment slip ${by}. Once the slip is uploaded, the order is not cancelled while we check it.`
  }
  if (status === 'payment_submitted') {
    return 'We are checking your slip against our bank records. The order is not cancelled while we check it.'
  }
  if (status === 'confirmed') {
    return kind === 'cod'
      ? 'Confirmed. We pack it the next working day. Have the exact amount ready for the courier.'
      : 'Payment confirmed. We pack it the next working day. For tracking once it has left, message us on Telegram.'
  }
  return null
}
