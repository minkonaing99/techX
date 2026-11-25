'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { CartLine } from '@/lib/cart-session'
import { toastAddressSaved } from '@/lib/address-note'
import { api } from '@/lib/api-client'
import { COD_CAP_MMK, NO_COD_MESSAGE, cartAllowsCod } from '@/lib/cod'
import { formatMmk } from '@/lib/money'
import {
  addressToDraft,
  buildOrderBody,
  draftToAddressBody,
  formatAddressSummary,
  type AddressLite,
  type DivisionLite,
  type PaymentMethodLite,
  type Step,
} from './checkout-model'
import { useAddressDraft, useLiveCart } from './checkout-hooks'
import { DeliverySection } from './delivery-section'
import { SavedAddressEditor } from './saved-address-editor'
import { MobileTotal, PaymentSection, ReviewSection, StepHeader, SummaryLine } from './checkout-steps'
import { CheckoutSummary } from './checkout-summary'

interface CheckoutFormProps {
  addresses: AddressLite[]
  divisions: DivisionLite[]
  methods: PaymentMethodLite[]
  lines: CartLine[]
  subtotal: number
  savings: number
}

export function CheckoutForm({
  addresses,
  divisions,
  methods,
  lines,
  subtotal,
  savings,
}: CheckoutFormProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('delivery')

  const [useNewAddress, setUseNewAddress] = useState(addresses.length === 0)
  const [selectedAddressId, setSelectedAddressId] = useState(addresses[0]?.id ?? '')
  const address = useAddressDraft()
  const edit = useAddressDraft()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const [paymentMethodId, setPaymentMethodId] = useState<string>('')
  const [paymentTouched, setPaymentTouched] = useState(false)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const activeDivisionId = useNewAddress
    ? address.draft.divisionId
    : addresses.find((a) => a.id === selectedAddressId)?.divisionId ?? ''
  const division = divisions.find((d) => d.id === activeDivisionId)
  const deliveryFee = division?.deliveryFeeMmk ?? 0
  const cart = useLiveCart(lines, subtotal, savings)

  const total = cart.liveSubtotal + deliveryFee
  const totalLine = (
    <MobileTotal
      items={cart.liveLines.reduce((n, l) => n + l.qty, 0)}
      deliveryFee={division ? deliveryFee : null}
      total={total}
    />
  )

  const codForCart = cartAllowsCod(cart.liveLines.map((l) => l.product.category))
  const codEligible = codForCart && Boolean(division?.codAllowed) && total <= COD_CAP_MMK
  const codNote = codEligible
    ? null
    : !codForCart
      ? NO_COD_MESSAGE
      : `Cash on Delivery available only for Yangon + Mandalay orders up to ${formatMmk(COD_CAP_MMK)}.`
  const visibleMethods = useMemo(
    () => methods.filter((m) => (m.kind === 'cod' ? codEligible : true)),
    [methods, codEligible],
  )

  function startEdit(id: string) {
    const a = addresses.find((x) => x.id === id)
    if (!a) return
    edit.load(addressToDraft(a, divisions))
    setEditingId(id)
  }

  /** Saves to the address itself, then re-reads the page so fee and summary follow it. */
  async function saveEdit() {
    if (!editingId || savingEdit) return
    if (!edit.validateAll()) {
      toast('Fix the highlighted fields.')
      return
    }
    setSavingEdit(true)
    const res = await api<{ onOpenOrder?: boolean }>(`/api/v1/addresses/${editingId}`, {
      method: 'PATCH',
      body: JSON.stringify(draftToAddressBody(edit.draft)),
    })
    setSavingEdit(false)
    if (!res.ok) {
      toast.error(res.error?.message ?? 'Could not save the address.')
      // A 404 means it is gone: close the edit and re-read the list.
      if (res.status === 404) {
        setEditingId(null)
        router.refresh()
      }
      return
    }
    const id = editingId
    setEditingId(null)
    toastAddressSaved(Boolean(res.data?.onOpenOrder))
    router.refresh()
    // The long form collapses back to a card; on a phone that left the view on the footer.
    requestAnimationFrame(() => document.getElementById(`address-${id}`)?.scrollIntoView?.({ block: 'start' }))
  }

  function attemptContinueDelivery() {
    if (editingId) {
      toast('Save or cancel the address first.')
      return
    }
    if (!useNewAddress) {
      // After a refresh the selected address may no longer be in the list.
      if (!addresses.some((a) => a.id === selectedAddressId)) {
        toast('Choose a saved address or add a new one.')
        return
      }
      setStep('payment')
      return
    }
    if (!address.validateAll()) {
      toast('Fix the highlighted fields.')
      return
    }
    setStep('payment')
  }

  function attemptContinuePayment() {
    setPaymentTouched(true)
    if (!paymentMethodId) {
      toast('Pick a payment method.')
      return
    }
    setStep('review')
  }

  async function placeOrder() {
    setLoading(true)
    const body = buildOrderBody({
      useNewAddress,
      draft: address.draft,
      selectedAddressId,
      paymentMethodId,
      notes,
    })

    const res = await api<{ orderId: string }>('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    setLoading(false)
    if (!res.ok || !res.data?.orderId) {
      // The other request of a double-submit (a second tab, a retry) already
      // placed this cart as an order. Staying here leaves a stale cart and a
      // button that can only fail.
      if (res.error?.code === 'TOO_MANY_OPEN_ORDERS') {
        toast.error(res.error.message ?? 'Too many open orders.', {
          action: { label: 'My orders', onClick: () => router.push('/account/orders') },
        })
        return
      }
      if (res.error?.code === 'CART_ALREADY_ORDERED') {
        await cart.refreshCart()
        router.push('/account/orders')
        return
      }
      /*
       * Another checkout can take the last units between this page rendering
       * and this click. Re-reading is what makes the refusal legible: without
       * it the summary still shows the line as fine, the button stays live,
       * and the next click fails identically.
       */
      if (res.error?.code === 'CART_UNORDERABLE') {
        await cart.refreshCart()
        toast.error(res.error.message ?? 'Something in your cart just sold out.')
        return
      }
      toast(res.error?.message ?? 'Order failed.')
      return
    }
    router.push(`/order/${res.data.orderId}?placed=1`)
  }

  return (
    <div className="mt-10 grid grid-cols-1 items-start gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:gap-14">
      <div>
        <StepHeader index={1} label="Delivery" active={step === 'delivery'} done={step !== 'delivery'} />
        {step === 'delivery' ? (
          <DeliverySection
            addresses={addresses}
            divisions={divisions}
            useNewAddress={useNewAddress}
            setUseNewAddress={(v) => {
              setUseNewAddress(v)
              if (v) setEditingId(null)
            }}
            selectedAddressId={selectedAddressId}
            setSelectedAddressId={setSelectedAddressId}
            draft={address.draft}
            setField={address.setField}
            liveError={address.liveError}
            markTouched={address.markTouched}
            onContinue={attemptContinueDelivery}
            totalLine={totalLine}
            editingId={editingId}
            onEdit={startEdit}
            editor={
              <SavedAddressEditor
                divisions={divisions}
                draft={edit.draft}
                setField={edit.setField}
                liveError={edit.liveError}
                markTouched={edit.markTouched}
                saving={savingEdit}
                onSave={saveEdit}
                onCancel={() => setEditingId(null)}
              />
            }
          />
        ) : (
          <SummaryLine
            text={formatAddressSummary(useNewAddress, address.draft, addresses, selectedAddressId)}
            onEdit={() => setStep('delivery')}
          />
        )}

        <StepHeader
          index={2}
          label="Payment method"
          active={step === 'payment'}
          done={step === 'review'}
        />
        {step === 'payment' ? (
          <PaymentSection
            methods={visibleMethods}
            paymentMethodId={paymentMethodId}
            setPaymentMethodId={(id) => {
              setPaymentMethodId(id)
              setPaymentTouched(true)
            }}
            paymentTouched={paymentTouched}
            codNote={codNote}
            onBack={() => setStep('delivery')}
            onContinue={attemptContinuePayment}
            totalLine={totalLine}
          />
        ) : step === 'review' ? (
          <SummaryLine
            text={methods.find((m) => m.id === paymentMethodId)?.name ?? '-'}
            onEdit={() => setStep('payment')}
          />
        ) : null}

        <StepHeader index={3} label="Review and place" active={step === 'review'} />
        {step === 'review' && (
          <ReviewSection
            notes={notes}
            setNotes={setNotes}
            loading={loading}
            cartEmpty={cart.cartEmpty}
            cartOrderable={cart.cartOrderable}
            total={total}
            onPlace={placeOrder}
          />
        )}
      </div>

      <CheckoutSummary
        lines={cart.liveLines}
        subtotal={cart.liveSubtotal}
        savings={cart.liveSavings}
        division={division}
        deliveryFee={deliveryFee}
        total={total}
      />
    </div>
  )
}
