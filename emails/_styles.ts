/**
 * Shared inline styles for React Email templates: the "Ledger" look.
 *
 * Paper, not a card: the email sits on the page background under a masthead
 * rule. Every weight is regular or lighter, every corner square. Terracotta
 * marks the primary button and the progress line, plus the footer's Telegram
 * link; ordinary links are underlined ink.
 */

const serif = "'Fraunces', Georgia, 'Times New Roman', serif"
const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/**
 * Palette, named. The rail picks its colours per step at render time, so those
 * values cannot live in a static style object.
 */
export const INK = '#1c1b19'
export const INK_SOFT = '#3a3833'
export const MUTED = '#8a8275'
/** The storefront terracotta, a step darker so 14px regular button text clears 4.5:1. */
export const ACCENT = '#b3532c'
export const LINE = '#e0dcd3'
const PAPER = '#f7f6f3'

export const body = {
  background: PAPER,
  // Gmail and Android have none of the system faces; without Helvetica/Arial they fall to a serif.
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
  fontWeight: 400 as const,
  margin: 0,
  padding: '32px 16px',
  color: INK,
}
export const container = { margin: '0 auto', maxWidth: '560px' }
export const p = { fontSize: '15px', lineHeight: '24px', color: INK_SOFT, margin: '8px 0' }
export const hr = { borderTop: `1px solid ${LINE}`, margin: '24px 0' }
export const code = {
  fontFamily: mono,
  background: PAPER,
  padding: '2px 6px',
  fontSize: '13px',
}

/** No card: same paper as the page, so the masthead rule frames it. */
export const shell = { background: PAPER, margin: '0 auto', maxWidth: '560px' }
export const content = { padding: '8px 8px 28px' }

/* ── Masthead: `TechX` left, `No. 14D3E1C1 · Cash on Delivery` right, over an ink rule ── */

export const mast = { width: '100%', borderBottom: `1px solid ${INK}` }
/** Bottom spacing lives on the cells: Outlook ignores padding on a <p>. */
export const mastBrandCell = { verticalAlign: 'bottom' as const, paddingBottom: '10px' }
export const mastRefCell = { verticalAlign: 'bottom' as const, paddingBottom: '12px' }
export const mastBrand = {
  margin: 0,
  fontFamily: serif,
  fontSize: '18px',
  lineHeight: '22px',
  fontWeight: 400 as const,
  color: INK,
}
export const mastRef = {
  margin: 0,
  fontFamily: mono,
  fontSize: '11px',
  lineHeight: '16px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  textAlign: 'right' as const,
  color: MUTED,
}

export const eyebrow = {
  margin: 0,
  fontSize: '11px',
  fontWeight: 400 as const,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  color: MUTED,
}
export const display = {
  fontFamily: serif,
  fontSize: '30px',
  lineHeight: '36px',
  margin: '26px 0 12px',
  fontWeight: 300 as const,
  letterSpacing: '-0.01em',
  color: INK,
}
export const lead = { fontSize: '15px', lineHeight: '24px', color: INK_SOFT, margin: '10px 0' }
export const small = { fontSize: '12px', lineHeight: '20px', color: MUTED, margin: '18px 0 0' }
export const link = { color: INK, textDecoration: 'underline' }

/* ── Progress rail: one rule per step (table cells; grid and media queries die in Outlook) ── */

export const rail = { width: '100%', margin: '18px 0 4px' }
/** Each step owns one fixed-width column; the gap between rules is this padding. */
export const railStep = { verticalAlign: 'top' as const, padding: '0 8px 0 0' }
/** The rule is a cell border: Outlook drops a background on a 2px div. */
export const railRule = { verticalAlign: 'top' as const, paddingTop: '8px' }
export const railLabel = { margin: 0, fontSize: '12px', lineHeight: '16px', fontWeight: 400 as const }
export const railDate = {
  margin: '2px 0 0',
  fontSize: '11px',
  lineHeight: '15px',
  color: MUTED,
  fontVariantNumeric: 'tabular-nums' as const,
}

/* ── Buttons: square, regular weight ── */

export const buttonPrimary = {
  background: ACCENT,
  color: '#fbfbf9',
  borderRadius: '0',
  padding: '12px 22px',
  fontSize: '14px',
  fontWeight: 400 as const,
  letterSpacing: '0.01em',
  textDecoration: 'none',
  display: 'inline-block',
}
export const buttonGhost = {
  ...buttonPrimary,
  background: PAPER,
  color: INK,
  border: `1px solid ${INK}`,
  padding: '11px 21px',
}
export const buttonRow = { margin: '24px 0 6px' }
export const buttonGap = { width: '10px', fontSize: '1px', lineHeight: '1px' }

/* ── Owner-alert fact rows: label left, value right ── */

export const factLabel = {
  fontSize: '12px',
  lineHeight: '20px',
  color: MUTED,
  padding: '7px 12px 7px 0',
  verticalAlign: 'top' as const,
  width: '96px',
  borderTop: `1px solid ${LINE}`,
}
export const factValue = {
  fontSize: '14px',
  lineHeight: '20px',
  color: INK,
  padding: '7px 0',
  verticalAlign: 'top' as const,
  borderTop: `1px solid ${LINE}`,
}
export const factLink = { color: INK, textDecoration: 'underline', fontWeight: 400 as const }

/** The one number an owner scans for first. */
export const amount = {
  margin: '2px 0 0',
  fontFamily: serif,
  fontSize: '32px',
  lineHeight: '38px',
  fontWeight: 300 as const,
  color: INK,
  fontVariantNumeric: 'tabular-nums' as const,
}

export const chip = {
  fontFamily: mono,
  color: INK,
  border: `1px solid ${LINE}`,
  padding: '2px 8px',
  fontSize: '13px',
  fontWeight: 400 as const,
  letterSpacing: '0.02em',
}

/* ── Item table: hairline rows, the total under an ink rule ── */

export const cellItem = {
  fontSize: '14px',
  lineHeight: '20px',
  color: INK_SOFT,
  padding: '9px 0',
  verticalAlign: 'top' as const,
  borderTop: `1px solid ${LINE}`,
}
export const cellPrice = {
  fontSize: '14px',
  lineHeight: '20px',
  color: INK,
  fontWeight: 400 as const,
  textAlign: 'right' as const,
  fontVariantNumeric: 'tabular-nums' as const,
  whiteSpace: 'nowrap' as const,
  padding: '9px 0',
  verticalAlign: 'top' as const,
  borderTop: `1px solid ${LINE}`,
}
export const cellMeta = { ...cellItem, color: MUTED, padding: '6px 0' }
export const cellMetaPrice = { ...cellPrice, color: INK_SOFT, padding: '6px 0' }
export const totalLabelCell = {
  fontSize: '14px',
  lineHeight: '24px',
  fontWeight: 400 as const,
  color: INK,
  padding: '10px 0 0',
  borderTop: `1px solid ${INK}`,
}
export const totalValCell = {
  fontFamily: serif,
  fontSize: '20px',
  lineHeight: '24px',
  fontWeight: 400 as const,
  color: INK,
  textAlign: 'right' as const,
  fontVariantNumeric: 'tabular-nums' as const,
  whiteSpace: 'nowrap' as const,
  padding: '10px 0 0',
  borderTop: `1px solid ${INK}`,
}

/** Bordered callout (cancellation reason, pay-to details). */
export const noteBox = {
  background: '#fbfbf9',
  border: `1px solid ${LINE}`,
  padding: '16px 18px',
  margin: '20px 0',
}
export const noteLabel = {
  margin: '0 0 6px',
  fontSize: '11px',
  fontWeight: 400 as const,
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  color: MUTED,
}
export const noteText = { margin: 0, fontSize: '14px', lineHeight: '22px', color: INK_SOFT }

/** Account details in the placed email. Selectable text, never an image. */
export const payLine = {
  margin: 0,
  fontSize: '15px',
  lineHeight: '23px',
  color: INK,
  fontWeight: 400 as const,
}
export const payAmount = {
  margin: '10px 0 0',
  fontFamily: serif,
  fontSize: '22px',
  lineHeight: '28px',
  color: INK,
  fontWeight: 400 as const,
  fontVariantNumeric: 'tabular-nums' as const,
}

export const badge = {
  display: 'inline-block',
  border: `1px solid ${LINE}`,
  color: INK_SOFT,
  fontSize: '12px',
  fontWeight: 400 as const,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  padding: '4px 10px',
}

/* ── Light footer under a hairline ── */

/** Side inset on a cell and the rule on an inner table: margins and table padding die in Outlook. */
export const footerCell = { padding: '0 8px' }
export const footer = { borderTop: `1px solid ${LINE}` }
export const footerMark = {
  margin: '16px 0 0',
  fontFamily: serif,
  fontSize: '15px',
  fontWeight: 400 as const,
  color: INK,
}
export const footerTag = { margin: '4px 0 0', fontSize: '12px', lineHeight: '18px', color: MUTED }
export const footerLink = { color: ACCENT, textDecoration: 'none' }
export const footerMeta = { margin: '10px 0 0', fontSize: '11px', lineHeight: '16px', color: MUTED }
