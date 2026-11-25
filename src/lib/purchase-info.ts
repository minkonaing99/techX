import { COD_CAP_MMK, NO_COD_MESSAGE } from '@/lib/cod'
import type { DeliveryRange } from '@/lib/delivery-range'
import { formatMmk } from '@/lib/money'

/*
 * The product page's delivery, warranty and payment lines. Every claim restates
 * a policy already on the shipping and returns pages; nothing here is new.
 */

const TIMING = 'Usually 1 to 4 days, remote townships up to a week.'

/** "A", "A or B", "A, B or C". */
function listOr(names: readonly string[]): string {
  if (names.length < 2) return names.join('')
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

export function deliveryLine(range: DeliveryRange | null, uncovered: readonly string[]): string {
  const fee = !range
    ? 'By division'
    : range.min === range.max
      ? formatMmk(range.min)
      : `${formatMmk(range.min)} to ${formatMmk(range.max)} by division`
  const gaps = uncovered.length > 0 ? ` Not yet to ${listOr(uncovered)}.` : ''
  return `${fee}, added at checkout. ${TIMING}${gaps}`
}

/** Admin-typed; anything longer is a sentence, not a period, and is not promised here. */
const MAX_PERIOD = 40
/** Placeholders an admin types for "none": no period to state. */
const NO_PERIOD = /^(none|no|n\/?a|-+)$/i

export function warrantyLine(specs: readonly { label: string; value: string }[]): string {
  const raw = specs.find((s) => s.label.trim().toLowerCase() === 'warranty')?.value.trim()
  const period = raw && raw.length <= MAX_PERIOD && !NO_PERIOD.test(raw) ? raw : undefined
  return `A factory fault in the first two weeks: we refund or replace it. After that, the manufacturer warranty${period ? ` (${period})` : ''}, claimed through us.`
}

export interface PaymentFacts {
  wallet: boolean
  cod: boolean
  /** The cheapest delivery to a division that takes cash on delivery. */
  codMinFee: number | null
}

/** Null when no payment method is switched on. */
export function paymentLine({
  unitPrice,
  wallet,
  cod,
  codMinFee,
  noCod = false,
}: PaymentFacts & { unitPrice: number; noCod?: boolean }): string | null {
  const cap = formatMmk(COD_CAP_MMK)
  const walletText = 'Mobile wallet or bank transfer'
  if (noCod && cod) return wallet ? `${walletText}. ${NO_COD_MESSAGE}` : NO_COD_MESSAGE
  if (!cod || codMinFee === null) return wallet ? `${walletText}.` : null
  // One unit plus the cheapest delivery already past the cap: COD can never apply.
  if (unitPrice + codMinFee > COD_CAP_MMK) {
    const stop = `Cash on delivery stops at ${cap}, so it is not offered for this item.`
    return wallet ? `${walletText}. ${stop}` : stop
  }
  const codText = `in Yangon and Mandalay for orders up to ${cap} including delivery`
  return wallet ? `${walletText}, or cash on delivery ${codText}.` : `Cash on delivery ${codText}.`
}
