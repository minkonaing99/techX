import { OrderRow } from '@/components/account/order-row'
import { ORDERS_SHOWN, loadAccountOrders } from '@/lib/account-orders'
import { auth } from '@/lib/auth'

export default async function OrdersPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const rows = await loadAccountOrders(session.user.id)

  return (
    <div>
      <h2 className="font-display text-[28px]">Orders</h2>
      {rows.length === 0 ? (
        <p className="mt-6 text-[14px] text-muted">No orders yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {rows.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </ul>
      )}
      {rows.length === ORDERS_SHOWN && (
        <p className="mt-4 text-[13px] text-muted">Showing your {ORDERS_SHOWN} most recent orders.</p>
      )}
    </div>
  )
}
