export interface DeliveryRange {
  min: number
  max: number
}

/** Cheapest and dearest deliverable division, for the cart before an address is known. */
export function deliveryRange(fees: readonly { deliveryFeeMmk: number }[]): DeliveryRange | null {
  if (fees.length === 0) return null
  const amounts = fees.map((f) => f.deliveryFeeMmk)
  return { min: Math.min(...amounts), max: Math.max(...amounts) }
}
