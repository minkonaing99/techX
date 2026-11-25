'use client'

import { formatMmk } from '@/lib/money'
import { PhoneField, SelectField, TextField } from '@/components/ui/field'
import {
  MAPS_URL_HINT,
  PHONE_HINT,
  PHONE_PREFIX,
  TELEGRAM_HINT,
  normalizePhoneLocal,
} from '@/lib/validators'
import type { AddressDraft, AddressLite, DivisionLite, DraftFieldKey } from './checkout-model'

export interface DraftFieldProps {
  draft: AddressDraft
  setField: <K extends keyof AddressDraft>(key: K, val: AddressDraft[K]) => void
  liveError: (field: DraftFieldKey) => string | null
  markTouched: (field: DraftFieldKey) => void
}

interface DeliverySectionProps extends DraftFieldProps {
  addresses: AddressLite[]
  divisions: DivisionLite[]
  useNewAddress: boolean
  setUseNewAddress: (v: boolean) => void
  selectedAddressId: string
  setSelectedAddressId: (v: string) => void
  onContinue: () => void
  /** Rendered just above Continue; the phone-only total. */
  totalLine?: React.ReactNode
  /** The saved address open for editing, shown in place of its card. */
  editingId?: string | null
  onEdit?: (id: string) => void
  editor?: React.ReactNode
}

export function DeliverySection(props: DeliverySectionProps) {
  const { addresses, useNewAddress, setUseNewAddress, onContinue } = props

  return (
    <section className="mt-4">
      {addresses.length > 0 && <SavedAddressList {...props} />}

      <div className="mt-2">
        <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-accent hover:opacity-80">
          <input
            type="radio"
            name="addr"
            checked={useNewAddress}
            onChange={() => setUseNewAddress(true)}
          />
          + Add new address
        </label>
      </div>

      {useNewAddress && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <ContactFields {...props} />
          <LocationFields {...props} />
          <ExtraFields {...props} />
        </div>
      )}

      {props.totalLine}
      <div className="mt-8 flex justify-end">
        <button
          onClick={onContinue}
          className="inline-flex w-full items-center justify-center rounded-[var(--radius-pill)] bg-ink px-8 py-3 text-[14px] font-medium text-cream transition-colors hover:bg-accent md:w-auto"
        >
          Continue to payment
        </button>
      </div>
    </section>
  )
}

type SavedAddressListProps = Pick<
  DeliverySectionProps,
  | 'addresses'
  | 'divisions'
  | 'useNewAddress'
  | 'setUseNewAddress'
  | 'selectedAddressId'
  | 'setSelectedAddressId'
  | 'editingId'
  | 'onEdit'
  | 'editor'
>

function SavedAddressList(props: SavedAddressListProps) {
  const { addresses, divisions, useNewAddress, setUseNewAddress, selectedAddressId, setSelectedAddressId } =
    props
  const { editingId, onEdit, editor } = props
  return (
    <div className="mb-4 space-y-3">
      {addresses.map((a) => {
        if (a.id === editingId) return <div key={a.id}>{editor}</div>
        const div = divisions.find((d) => d.id === a.divisionId)
        const selected = !useNewAddress && selectedAddressId === a.id
        return (
          <div key={a.id} id={`address-${a.id}`} className="relative scroll-mt-24">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border bg-surface p-4 pr-16 transition-colors ${
                selected
                  ? 'border-ink/50'
                  : 'border-line hover:border-ink/30'
              }`}
            >
              <input
                type="radio"
                name="addr"
                value={a.id}
                checked={selected}
                onChange={() => {
                  setUseNewAddress(false)
                  setSelectedAddressId(a.id)
                }}
                className="mt-1.5"
              />
              <div className="min-w-0">
                <div className="font-display text-[16px]">{a.label}</div>
                <div className="mt-0.5 text-[13px] text-ink-soft">
                  {a.recipient} · {a.phone}
                  {a.telegramUsername ? ` · @${a.telegramUsername}` : ''}
                </div>
                <div className="text-[13px] text-ink-soft">
                  {a.street}, {a.township}, {a.city}
                  {div ? `, ${div.name}` : ''}
                </div>
                {a.landmark && (
                  <div className="text-[12px] text-muted">{a.landmark}</div>
                )}
              </div>
            </label>
            {/* Outside the label: a button inside it would also select the card. */}
            {selected && !editingId && onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(a.id)}
                aria-label={`Edit ${a.label}`}
                className="absolute top-4 right-4 text-[13px] text-accent underline underline-offset-4 hover:opacity-80"
              >
                Edit
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

// The three field groups render fragments: each field must stay a direct child
// of the parent grid for `md:col-span-2` to apply.

export function ContactFields({ draft, setField, liveError, markTouched, divisions }: DraftFieldProps & { divisions: DivisionLite[] }) {
  return (
    <>
      <TextField
        label="Label"
        required
        value={draft.label}
        onChange={(v) => setField('label', v)}
        onBlur={() => markTouched('label')}
        error={liveError('label')}
      />
      <TextField
        label="Recipient name"
        required
        autoComplete="name"
        value={draft.recipient}
        onChange={(v) => setField('recipient', v)}
        onBlur={() => markTouched('recipient')}
        error={liveError('recipient')}
      />
      <PhoneField
        label="Phone"
        required
        prefix={PHONE_PREFIX}
        helper={PHONE_HINT}
        value={draft.phone}
        onChange={(v) => setField('phone', normalizePhoneLocal(v))}
        onBlur={() => markTouched('phone')}
        error={liveError('phone')}
      />
      <SelectField
        label="Division"
        required
        value={draft.divisionId}
        onChange={(v) => setField('divisionId', v)}
        onBlur={() => markTouched('divisionId')}
        error={liveError('divisionId')}
      >
        <option value="">Choose a division</option>
        {divisions.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} · {formatMmk(d.deliveryFeeMmk)}
          </option>
        ))}
      </SelectField>
    </>
  )
}

export function LocationFields({ draft, setField, liveError, markTouched }: DraftFieldProps) {
  return (
    <>
      <TextField
        label="City"
        required
        autoComplete="address-level2"
        value={draft.city}
        onChange={(v) => setField('city', v)}
        onBlur={() => markTouched('city')}
        error={liveError('city')}
      />
      <TextField
        label="Township"
        required
        value={draft.township}
        onChange={(v) => setField('township', v)}
        onBlur={() => markTouched('township')}
        error={liveError('township')}
      />
      <TextField
        className="md:col-span-2"
        label="Street + house no."
        required
        autoComplete="street-address"
        value={draft.street}
        onChange={(v) => setField('street', v)}
        onBlur={() => markTouched('street')}
        error={liveError('street')}
      />
      <TextField
        className="md:col-span-2"
        label="Landmark (optional)"
        value={draft.landmark}
        onChange={(v) => setField('landmark', v)}
      />
    </>
  )
}

export function ExtraFields({
  draft,
  setField,
  liveError,
  markTouched,
  showSave = true,
}: DraftFieldProps & { showSave?: boolean }) {
  return (
    <>
      <TextField
        label="Telegram (optional)"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="username"
        helper={TELEGRAM_HINT}
        value={draft.telegramUsername}
        onChange={(v) => setField('telegramUsername', v)}
        onBlur={() => markTouched('telegramUsername')}
        error={liveError('telegramUsername')}
      />
      <TextField
        label="Map pin (optional)"
        type="url"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="https://maps.app.goo.gl/..."
        helper={MAPS_URL_HINT}
        value={draft.mapsUrl}
        onChange={(v) => setField('mapsUrl', v)}
        onBlur={() => markTouched('mapsUrl')}
        error={liveError('mapsUrl')}
      />
      {showSave && (
        <label className="md:col-span-2 inline-flex items-center gap-2 text-[13px] text-ink-soft">
          <input
            type="checkbox"
            checked={draft.saveToAccount}
            onChange={(e) => setField('saveToAccount', e.target.checked)}
          />
          Save this address to my account
        </label>
      )}
    </>
  )
}
