import type { OrderStatus } from '@/db/schema/orders'
import { customerStatusHint, type MethodKind } from '@/lib/order-status'
import { SITE, telegramUrl } from '@/lib/site-info'

interface StatusHintProps {
  status: OrderStatus
  kind: MethodKind
  /** The order's formatted `expires_at`. */
  deadline: string
  /** False where the page already links the chat, as `/order/[id]` does. */
  telegramLink?: boolean
}

/**
 * The "what happens next" line on both order pages. A confirmed wallet order
 * is sent to Telegram for tracking, so the link sits right under it.
 */
export function StatusHint({ status, kind, deadline, telegramLink = true }: StatusHintProps) {
  const hint = customerStatusHint(status, kind, deadline)
  if (!hint) return null
  const tg = telegramLink && status === 'confirmed' && kind === 'wallet' ? telegramUrl() : null
  return (
    <>
      <p className="mt-3 max-w-[52ch] text-[15px] leading-[1.6] text-ink-soft">{hint}</p>
      {tg ? (
        <a
          href={tg}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[14px] text-ink underline underline-offset-4 hover:text-accent"
        >
          Message @{SITE.telegram} on Telegram
        </a>
      ) : null}
    </>
  )
}
