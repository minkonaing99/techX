import { shortOrderId } from '@/lib/order-status'
import { Masthead } from './_masthead'

interface OrderMetaProps {
  orderId: string
  /** Trailing context, e.g. `paid via KBZ Pay`. Omit when there is none. */
  note?: string
}

/**
 * The masthead for an order email: `TechX` | `No. 1C34B3B6 · paid via KBZ Pay`.
 *
 * The short form is the customer-facing reference everywhere else - the order
 * page header and every subject line already use these 8 characters. The full
 * UUID only ever appears inside the link.
 */
export function OrderMeta({ orderId, note }: OrderMetaProps) {
  const ref = `No. ${shortOrderId(orderId)}`
  return <Masthead reference={note ? `${ref} · ${note}` : ref} />
}

export default OrderMeta
