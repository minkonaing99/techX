import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema/auth'
import { auth } from '@/lib/auth'
import { AccountNav } from '@/components/account/account-nav'

export const metadata: Metadata = { title: 'Account', robots: { index: false, follow: true } }

export const dynamic = 'force-dynamic'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/signin?callbackUrl=/account')
  // From the row, not the session: the session keeps the name it had at
  // sign-in, so a rename on the overview would not show until the next one.
  const [me] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  return (
    <section className="container-prose py-16 md:py-20">
      <div className="eyebrow">Account</div>
      <h1 className="mt-3 break-words font-display text-[40px] leading-[1.05] text-ink md:text-[48px]">
        {me?.name || me?.email || 'Hello.'}
      </h1>

      {/* minmax(0, 1fr) and min-w-0: a grid track otherwise grows to its widest
          child, and on a phone that pushed every account page past the screen. */}
      <div className="mt-10 grid grid-cols-1 items-start gap-10 md:grid-cols-[240px_minmax(0,1fr)] md:gap-14">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  )
}
