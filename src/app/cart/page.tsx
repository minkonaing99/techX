import { getDeliveryFees } from '@/lib/delivery-fees'
import { deliveryRange, type DeliveryRange } from '@/lib/delivery-range'
import { CartView } from './cart-view'

export const dynamic = 'force-dynamic'

/** The cart still works without the fees; it just shows no range. */
async function loadRange(): Promise<DeliveryRange | null> {
  try {
    return deliveryRange(await getDeliveryFees())
  } catch (error: unknown) {
    // The message only: a connection error's cause chain names the DB user.
    console.warn('[cart] delivery fees unreadable', error instanceof Error ? error.message : String(error))
    return null
  }
}

export default async function CartPage() {
  return <CartView delivery={await loadRange()} />
}
