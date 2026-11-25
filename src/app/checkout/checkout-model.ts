import {
  PHONE_HINT,
  isGoogleMapsUrl,
  isPhoneLocal,
  isTelegramUsername,
  normalizePhoneLocal,
  normalizeTelegramUsername,
  required,
  toE164Phone,
} from '@/lib/validators'

export interface AddressLite {
  id: string
  label: string
  recipient: string
  phone: string
  divisionId: string
  city: string
  township: string
  street: string
  landmark: string | null
  telegramUsername: string | null
  mapsUrl: string | null
}

export interface DivisionLite {
  id: string
  name: string
  deliveryFeeMmk: number
  codAllowed: boolean
}

export interface PaymentMethodLite {
  id: string
  name: string
  kind: 'wallet' | 'cod'
}

export interface AddressDraft {
  label: string
  recipient: string
  phone: string
  divisionId: string
  city: string
  township: string
  street: string
  landmark: string
  telegramUsername: string
  mapsUrl: string
  saveToAccount: boolean
}

export const EMPTY_DRAFT: AddressDraft = {
  label: 'Home',
  recipient: '',
  phone: '',
  divisionId: '',
  city: '',
  township: '',
  street: '',
  landmark: '',
  telegramUsername: '',
  mapsUrl: '',
  saveToAccount: true,
}

export type Step = 'delivery' | 'payment' | 'review'
export type DraftFieldKey =
  | 'label'
  | 'recipient'
  | 'phone'
  | 'divisionId'
  | 'city'
  | 'township'
  | 'street'
  | 'telegramUsername'
  | 'mapsUrl'
export type DraftErrors = Partial<Record<DraftFieldKey, string>>
export type DraftTouched = Partial<Record<DraftFieldKey, boolean>>

export const ALL_DRAFT_FIELDS_TOUCHED: DraftTouched = {
  label: true,
  recipient: true,
  phone: true,
  divisionId: true,
  city: true,
  township: true,
  street: true,
  telegramUsername: true,
  mapsUrl: true,
}

export function validateDraft(d: AddressDraft): DraftErrors {
  const next: DraftErrors = {}
  const label = required(d.label, 'Label')
  if (label) next.label = label
  const recipient = required(d.recipient, 'Recipient name')
  if (recipient) next.recipient = recipient
  const phone = required(d.phone, 'Phone')
  if (phone) next.phone = phone
  else if (!isPhoneLocal(d.phone)) next.phone = PHONE_HINT
  if (!d.divisionId) next.divisionId = 'Choose a division.'
  const city = required(d.city, 'City')
  if (city) next.city = city
  const township = required(d.township, 'Township')
  if (township) next.township = township
  const street = required(d.street, 'Street')
  if (street) next.street = street
  // Both optional: only judged once something has been typed.
  if (d.telegramUsername.trim() && !isTelegramUsername(d.telegramUsername)) {
    next.telegramUsername = '5-32 letters, digits or underscores, starting with a letter.'
  }
  if (d.mapsUrl.trim() && !isGoogleMapsUrl(d.mapsUrl)) {
    next.mapsUrl = 'Must be a Google Maps link.'
  }
  return next
}

interface OrderBodyInput {
  useNewAddress: boolean
  draft: AddressDraft
  selectedAddressId: string
  paymentMethodId: string
  notes: string
}

/** A draft in the shape the address and order routes take. */
export function draftToAddressBody(draft: AddressDraft) {
  return {
    label: draft.label,
    recipient: draft.recipient,
    phone: toE164Phone(draft.phone),
    divisionId: draft.divisionId,
    city: draft.city,
    township: draft.township,
    street: draft.street,
    landmark: draft.landmark || null,
    telegramUsername: normalizeTelegramUsername(draft.telegramUsername) || null,
    mapsUrl: draft.mapsUrl.trim() || null,
  }
}

/**
 * A saved address back in the form's typed shape, for editing. A division
 * checkout no longer delivers to is cleared, so the buyer has to pick one.
 */
export function addressToDraft(a: AddressLite, divisions: readonly DivisionLite[]): AddressDraft {
  return {
    label: a.label,
    recipient: a.recipient,
    phone: normalizePhoneLocal(a.phone),
    divisionId: divisions.some((d) => d.id === a.divisionId) ? a.divisionId : '',
    city: a.city,
    township: a.township,
    street: a.street,
    landmark: a.landmark ?? '',
    telegramUsername: a.telegramUsername ?? '',
    mapsUrl: a.mapsUrl ?? '',
    saveToAccount: true,
  }
}

export function buildOrderBody(input: OrderBodyInput): Record<string, unknown> {
  const { useNewAddress, draft, selectedAddressId, paymentMethodId, notes } = input
  const base = { paymentMethodId, notes: notes || null }
  if (!useNewAddress) return { ...base, shippingAddressId: selectedAddressId }
  return { ...base, newAddress: { ...draftToAddressBody(draft), saveToAccount: draft.saveToAccount } }
}

export function formatAddressSummary(
  useNewAddress: boolean,
  draft: AddressDraft,
  addresses: AddressLite[],
  selectedAddressId: string,
): string {
  if (useNewAddress) return `${draft.recipient} · ${draft.street}, ${draft.township}, ${draft.city}`
  const a = addresses.find((x) => x.id === selectedAddressId)
  return a ? `${a.recipient} · ${a.street}, ${a.township}, ${a.city}` : '-'
}
