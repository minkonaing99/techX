import type { OrderStatus } from '@/db/schema/orders'
import type { MethodKind } from '@/db/schema/payment-methods'

export type { MethodKind }

/**
 * How long an order may sit in `pending_payment` before the unpaid-order sweep
 * cancels it. Set at checkout, and again when a slip is rejected.
 */
export const ORDER_EXPIRY_MS = 24 * 60 * 60 * 1000

/**
 * Single source of truth for which status moves are legal. The API route
 * enforces these; the admin table renders them. Previously duplicated in both
 * with a "keep in sync" comment.
 *
 * `confirmed` is the payment-confirmation + stock-commit + invoice boundary for
 * both payment kinds. `delivered` closes the order. Cancel from any live state.
 */
const WALLET_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['payment_submitted', 'cancelled'],
  payment_submitted: ['pending_payment', 'confirmed', 'cancelled'],
  confirmed: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

const COD_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['confirmed', 'cancelled'],
  payment_submitted: [],
  confirmed: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

/**
 * Whether an order in this status is holding stock, so cancelling it must put
 * that stock back. `confirmed` holds under both rules; before confirmation only
 * an order that reserved at checkout (`orders.stock_reserved`) does.
 */
export function holdsStock(status: OrderStatus, reserved: boolean): boolean {
  if (status === 'confirmed') return true
  return reserved && (status === 'pending_payment' || status === 'payment_submitted')
}

/** Statuses that end an order - nothing may follow them. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = ['delivered', 'cancelled']

export function allowedTransitions(
  from: OrderStatus,
  kind: MethodKind,
): readonly OrderStatus[] {
  return (kind === 'cod' ? COD_TRANSITIONS : WALLET_TRANSITIONS)[from]
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  kind: MethodKind,
): boolean {
  return from === to || allowedTransitions(from, kind).includes(to)
}

/**
 * Options for the admin list dropdown: current status plus forward moves only.
 * Cancelling is terminal and emails the customer, so it lives on the detail
 * page behind a confirm step instead. Sending a slip back needs a reason the
 * list cannot ask for, so it lives there too.
 */
export function forwardOptions(from: OrderStatus, kind: MethodKind): OrderStatus[] {
  const listable = (to: OrderStatus) =>
    to !== 'cancelled' && !(from === 'payment_submitted' && to === 'pending_payment')
  return [from, ...allowedTransitions(from, kind).filter(listable)]
}
