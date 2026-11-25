import Link from 'next/link'
import type { AccountOrder } from '@/lib/account-orders'
import { formatMmk } from '@/lib/money'
import { listStatusLabel, owesPayment, shortOrderId } from '@/lib/order-status'
import { orderDate } from '@/lib/relative-time'
import { cn } from '@/lib/utils'

/**
 * One order in the account lists. Customers could not tell orders apart from
 * an id and a date, so each row says what was bought and how it is paid, and
 * an order still waiting for its transfer stands out.
 */
export function OrderRow({ order }: { order: AccountOrder }) {
  const due = owesPayment(order.status, order.methodKind)
  return (
    <li className="flex items-start justify-between gap-4 py-5">
      <div className="min-w-0">
        <Link href={`/account/orders/${order.id}`} className="font-display text-[18px] hover:text-accent">
          Order {shortOrderId(order.id)}
        </Link>
        {order.items && <div className="mt-1 text-[14px] text-ink-soft">{order.items}</div>}
        <div className="mt-1 text-[12px] text-muted">
          {orderDate(order.placedAt)} · {order.methodName} ·{' '}
          <span className={cn(due && 'font-medium text-accent')}>{listStatusLabel(order.status, order.methodKind)}</span>
        </div>
      </div>
      <span className="price shrink-0 whitespace-nowrap text-[16px]">{formatMmk(order.totalMmk)}</span>
    </li>
  )
}
