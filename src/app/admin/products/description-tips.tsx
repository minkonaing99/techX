import { PROSE_MIN, TITLE_MAX } from '@/lib/description'

/** Typed as-is into the description box, this shows every rule at work. */
export const DESCRIPTION_EXAMPLE = `Portable 16" monitor for work and gaming.

Key points
+ 144Hz refresh rate
+ 2 year warranty

In the box
1x Monitor
2x USB-C cable`

/** How the product page lays out a description (src/lib/description.ts). */
export function DescriptionTips({ id }: { id: string }) {
  return (
    <details id={id} className="mt-1.5 text-[12px] text-muted">
      <summary className="cursor-pointer select-none hover:text-ink">Formatting tips</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>A blank line starts a new paragraph.</li>
        <li>A line starting with &quot;+&quot; and a space (or &quot;-&quot;) becomes a bullet point.</li>
        <li>
          A short line on its own, under {TITLE_MAX} characters with no full stop, followed by more
          lines becomes a small heading: &quot;Key points&quot;, &quot;In the box&quot;.
        </li>
        <li>
          Lines under {PROSE_MIN} characters keep their own line, which suits box contents such as
          &quot;1x USB-C cable&quot;. Longer lines run on into one paragraph, so breaking a long
          sentence anywhere is fine.
        </li>
        <li>Plain text only: HTML and markdown show exactly as typed.</li>
      </ul>
      <p className="mt-2">Example:</p>
      <pre className="mt-1 overflow-x-auto rounded-[var(--radius-sm)] border border-line bg-surface p-2.5 font-mono text-[11px] leading-relaxed text-ink-soft">
        {DESCRIPTION_EXAMPLE}
      </pre>
    </details>
  )
}
