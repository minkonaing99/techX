'use client'

import type { DivisionLite } from './checkout-model'
import { ContactFields, ExtraFields, LocationFields, type DraftFieldProps } from './delivery-section'

interface SavedAddressEditorProps extends DraftFieldProps {
  divisions: DivisionLite[]
  saving: boolean
  onSave: () => void
  onCancel: () => void
}

/** A saved address open at checkout, so a wrong detail is fixed without leaving. */
export function SavedAddressEditor(props: SavedAddressEditorProps) {
  const { saving, onSave, onCancel } = props
  return (
    <div className="rounded-[var(--radius)] border border-ink/50 bg-surface p-4">
      <div className="text-[13px] font-medium text-ink">Edit address</div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ContactFields {...props} />
        <LocationFields {...props} />
        <ExtraFields {...props} showSave={false} />
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-[var(--radius-pill)] bg-ink px-6 py-2.5 text-[14px] font-medium text-cream transition-colors hover:bg-accent disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-[var(--radius-pill)] border border-line bg-cream px-6 py-2.5 text-[14px] text-ink transition-colors hover:border-ink/40"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
