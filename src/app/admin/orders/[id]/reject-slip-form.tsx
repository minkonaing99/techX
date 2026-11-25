'use client'

import { useState } from 'react'
import { REJECTION_PRESETS, REJECTION_REASON_MAX, composeRejectionReason } from '@/lib/slip-rejection'

interface Props {
  busy: boolean
  onSubmit: (reason: string) => void
  onCancel: () => void
}

/**
 * Why the slip goes back. The reason is emailed to the customer and shown on
 * their order page, so it is written for them: a preset, plus details if any.
 */
export function RejectSlipForm({ busy, onSubmit, onCancel }: Props) {
  const [preset, setPreset] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const reason = composeRejectionReason(preset, details)
  const presetText = REJECTION_PRESETS.find((p) => p.id === preset)?.text ?? ''
  // Room left once the preset text and its joining space are counted.
  const room = REJECTION_REASON_MAX - (presetText ? presetText.length + 1 : 0)
  const needsDetails = preset === 'other' && !details.trim()
  // maxLength only stops typing: switching to a longer preset can leave the
  // details over the room, so the composed reason is checked as well.
  const tooLong = (reason?.length ?? 0) > REJECTION_REASON_MAX

  return (
    <form
      className="mt-4 rounded-[var(--radius)] border border-line bg-cream p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (reason) onSubmit(reason)
      }}
    >
      <fieldset>
        <legend className="text-[13px] font-medium text-ink">Why are you sending the slip back?</legend>
        <div className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
          {[...REJECTION_PRESETS, { id: 'other', label: 'Other' }].map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="reject-reason"
                value={p.id}
                checked={preset === p.id}
                onChange={() => setPreset(p.id)}
              />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="reject-details" className="mt-4 block text-[13px] font-medium text-ink">
        Details for the customer {preset !== 'other' && <span className="font-normal text-muted">(optional)</span>}
      </label>
      <textarea
        id="reject-details"
        value={details}
        maxLength={room}
        onChange={(e) => setDetails(e.target.value)}
        aria-describedby={needsDetails || tooLong ? 'reject-details-error' : 'reject-details-count'}
        aria-invalid={needsDetails || tooLong}
        aria-required={preset === 'other'}
        rows={3}
        className="mt-1.5 w-full rounded-[var(--radius)] border border-line bg-surface px-3 py-2 text-[13px] focus:border-ink/40"
      />
      {needsDetails || tooLong ? (
        <p id="reject-details-error" role="alert" className="mt-1 text-[12px] text-error">
          {needsDetails
            ? 'Write the reason the customer will read.'
            : `Too long by ${(reason?.length ?? 0) - REJECTION_REASON_MAX} characters.`}
        </p>
      ) : (
        <p id="reject-details-count" className="mt-1 text-[12px] text-muted">
          {room - details.length} characters left. The customer is emailed this with a new 24-hour deadline.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || !reason || tooLong}
          className="inline-flex items-center justify-center rounded-[var(--radius-pill)] bg-ink px-5 py-2.5 text-[13px] font-medium text-cream transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send slip back'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-[var(--radius-pill)] border border-line px-5 py-2.5 text-[13px] font-medium text-ink hover:border-ink/40"
        >
          Keep reviewing
        </button>
      </div>
    </form>
  )
}
