import 'server-only'

/**
 * Public-facing shop details used by the static content pages (about, contact,
 * legal, support). Server-only - do not import from a client component.
 *
 * Fields left `null` are hidden by the pages that render them. Fill them in
 * here and every page picks the value up.
 */
export interface SiteInfo {
  readonly name: string
  /** Trading name shown in legal copy. */
  readonly legalName: string
  readonly city: string
  readonly country: string
  /** Street address, without the city. */
  readonly street: string | null
  /** Reply-capable support inbox. Not the send-only SMTP user. */
  readonly email: string | null
  /** Voice number, in display form. */
  readonly phone: string | null
  /** Digits only, for tel: and viber: links. */
  readonly phoneDigits: string | null
  /** Same number on Viber, or a different one. */
  readonly viber: string | null
  /** Telegram username without the @. Reuses the order-page backup contact. */
  readonly telegram: string | null
  /** LINE ID without the @. */
  readonly line: string | null
  /** Full Facebook page URL. */
  readonly facebook: string | null
  /** Opening hours, e.g. 'Mon-Sat, 9:00-18:00'. */
  readonly hours: string | null
}

export const SITE: SiteInfo = {
  name: 'TechX',
  legalName: 'TechX',
  // TODO: replace every placeholder below with the real shop details.
  city: 'Your City',
  country: 'Myanmar',
  street: 'Your Street Address',
  email: null,
  phone: '09 000 000 000',
  phoneDigits: '09000000000',
  viber: '09 000 000 000',
  telegram: process.env.TELEGRAM_BACKUP_USERNAME ?? 'your_telegram',
  line: 'your_line_id',
  facebook: 'https://www.facebook.com/your-page',
  hours: null,
}

export const LOCATION = `${SITE.city}, ${SITE.country}`

/** Where the contact form is delivered. Falls back to the SMTP account. */
export function contactInbox(): string | null {
  return SITE.email ?? process.env.SMTP_USER ?? null
}

/** Last review date printed on the legal pages. */
export const LEGAL_UPDATED = '24 October 2026'

/** The shop's Telegram chat, or null when no handle is set. */
export function telegramUrl(): string | null {
  return SITE.telegram ? `https://t.me/${SITE.telegram}` : null
}
