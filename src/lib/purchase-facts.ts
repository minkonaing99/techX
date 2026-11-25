import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { paymentMethods } from '@/db/schema/payment-methods'
import { getDeliveryFees, getUncoveredDivisions } from '@/lib/delivery-fees'
import { deliveryRange, type DeliveryRange } from '@/lib/delivery-range'
import { isOfferable } from '@/lib/payment-methods'
import type { PaymentFacts } from '@/lib/purchase-info'

export interface PurchaseFacts extends PaymentFacts {
  range: DeliveryRange | null
  uncovered: string[]
}

/** What the product page's purchase info is built from: the same rows checkout reads. */
export async function getPurchaseFacts(): Promise<PurchaseFacts> {
  const [fees, uncovered, methods] = await Promise.all([
    getDeliveryFees(),
    getUncoveredDivisions(),
    // Only what isOfferable reads: account details never leave this function.
    db
      .select({
        kind: paymentMethods.kind,
        accountName: paymentMethods.accountName,
        accountPhone: paymentMethods.accountPhone,
        qrImageUrl: paymentMethods.qrImageUrl,
      })
      .from(paymentMethods)
      .where(eq(paymentMethods.isActive, true))
      .orderBy(asc(paymentMethods.sortOrder)),
  ])
  const offered = methods.filter(isOfferable)
  const codFees = fees.filter((f) => f.codAllowed).map((f) => f.deliveryFeeMmk)
  return {
    range: deliveryRange(fees),
    uncovered,
    wallet: offered.some((m) => m.kind === 'wallet'),
    cod: offered.some((m) => m.kind === 'cod'),
    codMinFee: codFees.length > 0 ? Math.min(...codFees) : null,
  }
}
