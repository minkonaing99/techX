import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { addresses } from '@/db/schema/addresses'
import { users } from '@/db/schema/auth'
import { OrderRow } from '@/components/account/order-row'
import { ProfileForm } from '@/components/account/profile-form'
import { loadAccountOrders } from '@/lib/account-orders'
import { auth } from '@/lib/auth'

export default async function AccountOverview() {
  const session = await auth()
  if (!session?.user?.id) return null

  const [recentOrders, addrRows, [me]] = await Promise.all([
    loadAccountOrders(session.user.id, 3),
    db.select().from(addresses).where(eq(addresses.userId, session.user.id)).limit(1),
    db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1),
  ])

  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-end justify-between">
          <h2 className="font-display text-[24px]">Recent orders</h2>
          <Link href="/account/orders" className="text-[13px] text-accent underline underline-offset-4">
            View all
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="mt-4 text-[14px] text-muted">No orders yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {recentOrders.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-end justify-between">
          <h2 className="font-display text-[24px]">Default address</h2>
          <Link href="/account/addresses" className="text-[13px] text-accent underline underline-offset-4">
            Manage
          </Link>
        </div>
        {addrRows.length === 0 ? (
          <p className="mt-4 text-[14px] text-muted">No address saved.</p>
        ) : (
          <div className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-5 text-[14px] text-ink-soft">
            <div className="font-display text-[16px] text-ink">{addrRows[0]?.label}</div>
            <div className="mt-1">
              {addrRows[0]?.recipient} · {addrRows[0]?.street}, {addrRows[0]?.township}, {addrRows[0]?.city}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-[24px]">Your details</h2>
        <ProfileForm initialName={me?.name ?? ''} email={me?.email ?? ''} />
      </section>
    </div>
  )
}
