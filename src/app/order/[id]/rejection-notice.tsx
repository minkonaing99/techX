interface Props {
  /** The owner's reason, written for the customer. */
  reason: string
  /** The new deadline, already in Myanmar time. */
  deadline: string
}

/** Shown above the payment panel while a sent-back slip waits for a new one. */
export function RejectionNotice({ reason, deadline }: Props) {
  return (
    <section
      aria-labelledby="slip-rejected-heading"
      className="mt-8 rounded-[var(--radius-lg)] border border-error/30 bg-error/5 p-5 md:p-6"
    >
      <h2 id="slip-rejected-heading" className="font-display text-[18px] text-ink">
        We could not accept your slip
      </h2>
      <p className="mt-2 whitespace-pre-wrap text-[14px] text-ink-soft">{reason}</p>
      <p className="mt-3 text-[13px] text-muted">
        Pay or upload a new slip by {deadline} (Myanmar time), or the order is cancelled.
      </p>
    </section>
  )
}
