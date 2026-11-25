import { Fragment } from 'react'
import { formatDescription } from '@/lib/description'

/** The product description, laid out from the structure typed into it. */
export function ProductDescription({ text }: { text: string }) {
  return (
    <div className="mt-3 text-[15px] leading-relaxed text-ink-soft">
      {formatDescription(text).map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <h3 key={i} className="mt-5 text-[14px] font-medium text-ink first:mt-0">
              {block.text}
            </h3>
          )
        }
        if (block.kind === 'list') {
          return (
            <ul key={i} className="mt-2 list-disc space-y-1 pl-5 marker:text-muted first:mt-0">
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="mt-3 first:mt-0">
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
