'use client'

import { useState } from 'react'
import { useCart } from '@/lib/cart-store'
import { cartSavings, cartSubtotal } from '@/lib/pricing'
import { canOrderCart } from '@/lib/cart-availability'
import type { CartLine } from '@/lib/cart-session'
import {
  ALL_DRAFT_FIELDS_TOUCHED,
  EMPTY_DRAFT,
  validateDraft,
  type AddressDraft,
  type DraftErrors,
  type DraftFieldKey,
  type DraftTouched,
} from './checkout-model'

export function useAddressDraft() {
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_DRAFT)
  const [draftErrors, setDraftErrors] = useState<DraftErrors>({})
  const [draftTouched, setDraftTouched] = useState<DraftTouched>({})

  function setField<K extends keyof AddressDraft>(key: K, val: AddressDraft[K]) {
    const next: AddressDraft = { ...draft, [key]: val }
    setDraft(next)
    if (key in draftTouched && draftTouched[key as DraftFieldKey]) {
      setDraftErrors(validateDraft(next))
    }
  }

  function markTouched(field: DraftFieldKey) {
    setDraftTouched((t) => ({ ...t, [field]: true }))
    setDraftErrors(validateDraft(draft))
  }

  function liveError(field: DraftFieldKey): string | null {
    if (!draftTouched[field]) return null
    return draftErrors[field] ?? null
  }

  /** Touches every field so all errors show, and reports whether the draft is clean. */
  function validateAll(): boolean {
    const v = validateDraft(draft)
    setDraftErrors(v)
    setDraftTouched(ALL_DRAFT_FIELDS_TOUCHED)
    return Object.keys(v).length === 0
  }

  /** Replaces the whole draft, as when a saved address opens for editing. */
  function load(next: AddressDraft) {
    setDraft(next)
    setDraftErrors({})
    setDraftTouched({})
  }

  return { draft, setField, markTouched, liveError, validateAll, load }
}

export function useLiveCart(lines: CartLine[], subtotal: number, savings: number) {
  /*
   * The props are the server's snapshot at render. Once the store has caught
   * up it becomes the source, so a line fixed here - or re-read after the
   * server refuses one - is reflected without a round trip through the page.
   */
  const storeItems = useCart((s) => s.items)
  const cartHydrated = useCart((s) => s.hydrated)
  const refreshCart = useCart((s) => s.fetch)

  const liveLines = cartHydrated ? storeItems : lines
  const liveSubtotal = cartHydrated ? cartSubtotal(liveLines) : subtotal
  const liveSavings = cartHydrated ? cartSavings(liveLines) : savings
  /*
   * Empty is held apart from unorderable. `canOrderCart` refuses both, and
   * removing the last bad line here would otherwise leave the button dead
   * under a message telling the shopper to remove items that are already gone.
   */
  const cartEmpty = liveLines.length === 0
  const cartOrderable = canOrderCart(liveLines)

  return { liveLines, liveSubtotal, liveSavings, cartEmpty, cartOrderable, refreshCart }
}
