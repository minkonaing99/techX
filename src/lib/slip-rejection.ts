/*
 * Why the owner sends a payment slip back. Shared by the admin form (client)
 * and the order route, so it imports nothing server-side. The text is written
 * to the customer: it goes into their email and onto their order page.
 */

export const REJECTION_REASON_MAX = 500

export const REJECTION_PRESETS = [
  { id: 'amount', label: 'Amount does not match', text: 'The amount on the slip does not match the order total.' },
  { id: 'account', label: 'Wrong account', text: 'The transfer went to an account that is not ours.' },
  { id: 'unreadable', label: 'Slip unreadable', text: 'We could not read the slip image.' },
  { id: 'not_found', label: 'Payment not found', text: 'We could not find this payment in our account.' },
] as const

/** A preset's text plus any details, or the details alone for 'other'. Null when there is no reason. */
export function composeRejectionReason(presetId: string | null, details: string): string | null {
  const extra = details.trim()
  if (presetId === 'other') return extra || null
  const preset = REJECTION_PRESETS.find((p) => p.id === presetId)
  if (!preset) return null
  return extra ? `${preset.text} ${extra}` : preset.text
}
