import type { MethodKind } from '@/db/schema/payment-methods'

interface MethodFields {
  kind: MethodKind
  accountName: string | null
  accountPhone: string | null
  qrImageUrl: string | null
}

/**
 * Whether an active method can be offered to a customer. Checkout lists only
 * these and the order route accepts only these, so the two cannot disagree.
 *
 * The QR is optional (docs/PAYMENT.md): a manual bank transfer has none, and
 * the order page shows the account details at full width instead. Without an
 * account name and number there is nothing to pay into. Cash on delivery has
 * no account.
 */
export function isOfferable(method: MethodFields): boolean {
  if (method.kind === 'cod') return true
  return Boolean(method.accountName?.trim() && method.accountPhone?.trim())
}
