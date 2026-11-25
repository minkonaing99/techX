import { toast } from 'sonner'
/**
 * Editing a saved address never moves an order already placed: each order
 * keeps its own copy of the address (`orders.ship_*`). The customer is told so
 * instead of being refused.
 */
export const ADDRESS_ON_OPEN_ORDER_NOTE =
  'Address updated. An order you already placed still goes to the address it was placed with. Message us if that order needs to change.'

/** The toast after an address edit; the longer note stays up long enough to read. */
export function toastAddressSaved(onOpenOrder: boolean): void {
  if (onOpenOrder) toast(ADDRESS_ON_OPEN_ORDER_NOTE, { duration: 8000 })
  else toast('Address updated.')
}
