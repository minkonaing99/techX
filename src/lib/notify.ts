import { sendMail, type MailParams } from '@/lib/mail'
import { maskEmail } from '@/lib/mask'
import { sendTelegram } from '@/lib/telegram'

const REASON_MAX = 200

const EMAIL_RE = /[^\s<>"'@]+@[^\s<>"']+/g

/**
 * The SMTP error in one line. Servers quote addresses back, in any case and
 * not only the recipient's, so every address is masked. Replies can be
 * multi-line and come from a remote server: control characters are flattened
 * so the text cannot forge log lines or lay out a fake message.
 */
function reasonFor(err: unknown): string {
  const e = err as { code?: unknown; responseCode?: unknown; message?: unknown }
  const code = [e?.code, e?.responseCode].filter((v) => v !== undefined).join(' ')
  const message = String(e?.message ?? err)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(EMAIL_RE, (address) => maskEmail(address))
  return `${code ? `${code} ` : ''}${message}`.slice(0, REASON_MAX)
}

/**
 * Sends an email; when it does not go out, tells the owner on Telegram which
 * email and which order, so it can be resent by hand. Never throws: a failed
 * notification never fails the customer's action.
 *
 * Only `what`, the masked recipient and the error reach the alert, never the
 * body - verification and reset emails carry live tokens. Deliberately not
 * routed through `reportError`: its throttle would fold an SMTP outage into one
 * message and drop which orders were affected.
 */
export async function mailOrAlert(params: MailParams, what: string): Promise<boolean> {
  let reason: string
  try {
    const { delivered } = await sendMail(params)
    if (delivered) return true
    reason = 'SMTP not configured'
  } catch (err) {
    reason = reasonFor(err)
  }

  const to = maskEmail(params.to)
  console.error('[mail] not sent', what, to, reason)
  // Not awaited: the customer's request must not also wait on Telegram, and a
  // slower reply for a registered address is an enumeration signal.
  void sendTelegram(`Email not sent: ${what} to ${to}\n${reason}`).catch(() => false)
  return false
}
