'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CATEGORIES } from '@/lib/categories'
import { api } from '@/lib/api-client'
import type { ProductFormValues } from './product-details-form'
import {
  emptyForm,
  formToBody,
  formToPatch,
  formToRow,
  rowToForm,
  validateForm,
  type ExpandedSection,
  type Row,
} from './product-form'

export function useProductRows(initial: Row[]) {
  const [rows, setRows] = useState<Row[]>(initial)
  const [creating, setCreating] = useState(false)
  const [newDraft, setNewDraft] = useState<ProductFormValues>(() =>
    emptyForm(CATEGORIES[0].id),
  )
  const [savingNew, setSavingNew] = useState(false)

  const [expanded, setExpanded] = useState<Record<string, ExpandedSection>>({})
  const [drafts, setDrafts] = useState<Record<string, ProductFormValues>>({})
  const [savingRow, setSavingRow] = useState<Record<string, boolean>>({})

  function openSection(id: string, section: ExpandedSection) {
    setExpanded((m) => ({ ...m, [id]: m[id] === section ? null : section }))
    setDrafts((d) => {
      if (d[id]) return d
      const row = rows.find((r) => r.id === id)
      return row ? { ...d, [id]: rowToForm(row) } : d
    })
  }

  function updateDraft(id: string, next: ProductFormValues) {
    setDrafts((d) => ({ ...d, [id]: next }))
  }

  function discardDraft(id: string) {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    setDrafts((d) => ({ ...d, [id]: rowToForm(row) }))
  }

  function cancelCreate() {
    setCreating(false)
    setNewDraft(emptyForm(CATEGORIES[0].id))
  }

  /** Answers whether the product was created. */
  async function createProduct(): Promise<boolean> {
    const errors = validateForm(newDraft, true, new Set(rows.map((r) => r.slug)))
    if (errors.length > 0) {
      toast(errors[0]!)
      return false
    }
    setSavingNew(true)
    const body = formToBody(newDraft)
    const res = await api<{ slug: string; textVersion: string }>('/api/v1/admin/products', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    setSavingNew(false)
    if (!res.ok || !res.data) {
      toast(res.error?.message ?? 'Create failed.')
      return false
    }
    const slug = res.data.slug
    const fresh = formToRow(newDraft, { id: slug, slug, hasPhotos: false, textVersion: res.data.textVersion })
    setRows((rs) => [fresh, ...rs])
    setCreating(false)
    setNewDraft(emptyForm(CATEGORIES[0].id))
    toast('Product created. Open Edit photos to upload images.')
    return true
  }

  async function saveRow(id: string) {
    const draft = drafts[id]
    const original = rows.find((r) => r.id === id)
    if (!draft || !original) return

    const errors = validateForm(draft, false, new Set())
    if (errors.length > 0) {
      toast(errors[0]!)
      return
    }

    setSavingRow((m) => ({ ...m, [id]: true }))
    const res = await api<{ textVersion?: string }>(`/api/v1/admin/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(formToPatch(draft, original)),
    })
    setSavingRow((m) => ({ ...m, [id]: false }))
    if (!res.ok) {
      // An order moved stock while the page was open. Adopt the current number
      // so the edit, kept as typed, replaces it on the next save.
      const current = (res.error?.details as { stockQty?: unknown } | undefined)?.stockQty
      if (res.error?.code === 'STOCK_CHANGED' && typeof current === 'number') {
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, stockQty: current } : r)))
      }
      toast(res.error?.message ?? 'Save failed.')
      return
    }

    const updated = formToRow(draft, { ...original, textVersion: res.data?.textVersion ?? original.textVersion })
    setRows((rs) => rs.map((r) => (r.id === id ? updated : r)))
    setDrafts((d) => ({ ...d, [id]: rowToForm(updated) }))
    toast('Saved.')
  }

  function markHasPhotos(id: string, hasPhotos: boolean) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, hasPhotos } : r)))
  }

  function forgetRow(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id))
    setDrafts((d) => {
      const next = { ...d }
      delete next[id]
      return next
    })
    setExpanded((e) => {
      const next = { ...e }
      delete next[id]
      return next
    })
  }

  // Soft-delete fallback via PATCH isActive = false.
  async function softDeleteRow(id: string) {
    const patchRes = await api(`/api/v1/admin/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: false }),
    })
    setSavingRow((m) => ({ ...m, [id]: false }))
    if (patchRes.ok) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, isActive: false } : r)))
      setDrafts((d) => {
        const cur = d[id]
        return cur ? { ...d, [id]: { ...cur, isActive: false } } : d
      })
      toast('Has order history - marked inactive instead.')
    } else {
      toast('Could not mark inactive. Try again.')
    }
  }

  // Hard-delete attempt. If the product has order history the server returns
  // 409; we fall back to soft-delete by flipping isActive = false. Either way
  // the product disappears from /shop.
  async function deleteRow(id: string) {
    const original = rows.find((r) => r.id === id)
    if (!original) return
    const ok = confirm(
      `Delete "${original.name}"? This removes the catalog row and its R2 photos. ` +
        `Products that have existing orders cannot be hard-deleted - those will be marked inactive instead.`,
    )
    if (!ok) return

    setSavingRow((m) => ({ ...m, [id]: true }))
    const res = await api(`/api/v1/admin/products/${id}`, { method: 'DELETE' })
    if (res.ok) {
      forgetRow(id)
      setSavingRow((m) => ({ ...m, [id]: false }))
      toast('Deleted.')
      return
    }

    if (res.error?.code === 'CONFLICT') {
      await softDeleteRow(id)
      return
    }
    setSavingRow((m) => ({ ...m, [id]: false }))
    toast(res.error?.message ?? `Delete failed (${res.status}).`)
  }

  return {
    rows,
    creating,
    setCreating,
    newDraft,
    setNewDraft,
    savingNew,
    expanded,
    drafts,
    savingRow,
    openSection,
    updateDraft,
    discardDraft,
    cancelCreate,
    createProduct,
    saveRow,
    markHasPhotos,
    deleteRow,
  }
}
