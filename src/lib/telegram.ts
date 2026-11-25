/**
 * Telegram owner-alert helper.
 *
 * When TELEGRAM_BOT_TOKEN + TELEGRAM_OWNER_CHAT_ID are unset, this is a no-op.
 * Never throws, so the caller's transactional success path is never blocked by
 * an external service outage. Returns whether the message was delivered, and
 * logs a refusal or outage - a bad token or a blocked bot used to look exactly
 * like success.
 */

const API = 'https://api.telegram.org'

/**
 * Plain text unless a caller opts in to markup.
 *
 * ponytail: `html` is a boolean rather than an escaping helper because only one
 * caller wants markup. With HTML on by default, any interpolated value carrying
 * a `<` made Telegram reject the whole message - so an order alert was one
 * awkward payment-method name away from silently not arriving.
 */
export async function sendTelegram(text: string, opts: { html?: boolean } = {}): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID
  if (!token || !chatId) return false

  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(opts.html ? { parse_mode: 'HTML' } : {}),
        disable_web_page_preview: true,
      }),
      // Callers await this on request paths; a hung API must not hang them.
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) return true
    const body = (await res.json().catch(() => ({}))) as { description?: unknown }
    console.error('[telegram] send failed', res.status, String(body.description ?? ''))
    return false
  } catch (err) {
    // The URL carries the bot token, and some fetch errors quote the URL.
    const message = err instanceof Error ? err.message : String(err)
    console.error('[telegram] send failed', message.replaceAll(token, '***'))
    return false
  }
}
