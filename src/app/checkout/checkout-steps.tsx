'use client'

import Link from 'next/link'
import { formatMmk } from '@/lib/money'
import { TextAreaField } from '@/components/ui/field'
import type { PaymentMethodLite } from './checkout-model'

interface StepHeaderProps {
  index: number
  label: string
  active?: boolean
  done?: boolean
}

export function StepHeader({ index, label, active, done }: StepHeaderProps) {
  return (
    <div className="mt-8 flex items-center gap-3">
      <span
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] tabular-nums ${
          done
            ? 'bg-accent text-cream'
            : active
              ? 'bg-ink text-cream'
              : 'bg-sand text-muted'
        }`}
      >
        {index}
      </span>
      <h2 className={`font-display text-[20px] ${active ? 'text-ink' : 'text-muted'}`}>{label}</h2>
    </div>
  )
}

interface SummaryLineProps {
  text: string
  onEdit: () => void
}

export function SummaryLine({ text, onEdit }: SummaryLineProps) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-[var(--radius)] border border-line bg-cream px-4 py-3 text-[13px]">
      <span className="text-ink-soft">{text}</span>
      <button onClick={onEdit} className="text-accent underline underline-offset-4">
        Edit
      </button>
    </div>
  )
}

interface MobileTotalProps {
  items: number
  /** Null until a division is chosen. */
  deliveryFee: number | null
  total: number
}

/**
 * Phones only: the full summary sits after the steps and stacks below the
 * buttons, so this puts delivery and the total right above each Continue.
 */
export function MobileTotal({ items, deliveryFee, total }: MobileTotalProps) {
  const count = `${items} ${items === 1 ? 'item' : 'items'}`
  return (
    <p className="mt-8 rounded-[var(--radius)] bg-surface px-4 py-3 text-[13px] text-ink-soft md:hidden">
      {deliveryFee === null
        ? `${count} - Delivery after you choose a division - Subtotal ${formatMmk(total)}`
        : `${count} - Delivery ${formatMmk(deliveryFee)} - Total ${formatMmk(total)}`}
    </p>
  )
}

interface PaymentSectionProps {
  methods: PaymentMethodLite[]
  paymentMethodId: string
  setPaymentMethodId: (id: string) => void
  paymentTouched: boolean
  /** Why cash on delivery is missing, when it is. */
  codNote: string | null
  onBack: () => void
  onContinue: () => void
  /** Rendered just above the buttons; the phone-only total. */
  totalLine?: React.ReactNode
}

export function PaymentSection(props: PaymentSectionProps) {
  const { methods, paymentMethodId, setPaymentMethodId, paymentTouched, codNote, onBack, onContinue, totalLine } =
    props

  if (methods.length === 0) {
    return (
      <section className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-6 text-[14px] text-ink-soft">
        No payment methods available yet. The shop owner is configuring them.
      </section>
    )
  }

  const showError = paymentTouched && !paymentMethodId

  return (
    <section className="mt-4 space-y-3">
      {methods.map((m) => (
        <PaymentMethodOption
          key={m.id}
          method={m}
          checked={paymentMethodId === m.id}
          showError={showError}
          onSelect={() => setPaymentMethodId(m.id)}
        />
      ))}
      {showError && (
        <p className="text-[12px] text-error">Choose a payment method to continue.</p>
      )}
      {codNote && <p className="text-[12px] text-muted">{codNote}</p>}
      {totalLine}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <button
          onClick={onBack}
          className="inline-flex w-full items-center justify-center rounded-[var(--radius-pill)] border border-line bg-cream px-6 py-3 text-[14px] font-medium text-ink hover:border-ink/40 sm:w-auto"
        >
          Back
        </button>
        <button
          onClick={onContinue}
          className="inline-flex w-full items-center justify-center rounded-[var(--radius-pill)] bg-ink px-8 py-3 text-[14px] font-medium text-cream transition-colors hover:bg-accent sm:w-auto"
        >
          Continue to review
        </button>
      </div>
    </section>
  )
}

interface PaymentMethodOptionProps {
  method: PaymentMethodLite
  checked: boolean
  showError: boolean
  onSelect: () => void
}

function PaymentMethodOption({ method: m, checked, showError, onSelect }: PaymentMethodOptionProps) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border bg-surface p-4 transition-colors ${
        checked
          ? 'border-ink/50'
          : showError
            ? 'border-error/60'
            : 'border-line hover:border-ink/30'
      }`}
    >
      <input type="radio" name="method" value={m.id} checked={checked} onChange={onSelect} />
      <div>
        <div className="font-display text-[16px]">{m.name}</div>
        <div className="text-[12px] text-muted">
          {m.kind === 'wallet' ? 'Mobile wallet - pay by QR' : 'Cash on Delivery'}
        </div>
      </div>
    </label>
  )
}

interface ReviewSectionProps {
  notes: string
  setNotes: (v: string) => void
  loading: boolean
  cartEmpty: boolean
  cartOrderable: boolean
  total: number
  onPlace: () => void
}

export function ReviewSection(props: ReviewSectionProps) {
  const { notes, setNotes, loading, cartEmpty, cartOrderable, total, onPlace } = props
  return (
    <section className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-6">
      <TextAreaField
        label="Order notes (optional)"
        value={notes}
        onChange={(v) => setNotes(v.slice(0, 1000))}
        placeholder="Anything we should know about delivery."
        rows={3}
      />
      <button
        onClick={onPlace}
        disabled={loading || !cartOrderable}
        className="mt-6 inline-flex w-full items-center justify-center rounded-[var(--radius-pill)] bg-ink py-3.5 text-[14px] font-medium text-cream transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Placing order…' : `Place order - ${formatMmk(total)}`}
      </button>
      {cartEmpty ? (
        <p className="mt-2 text-center text-[12px] text-muted">
          Your cart is empty.{' '}
          <Link href="/shop" className="text-accent underline underline-offset-4">
            Back to the shop
          </Link>
        </p>
      ) : (
        !cartOrderable && (
          <p className="mt-2 text-center text-[12px] text-[var(--color-error)]">
            Remove or reduce the marked items in your summary to continue.
          </p>
        )
      )}
    </section>
  )
}
