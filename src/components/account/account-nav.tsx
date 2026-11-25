'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SignOutButton } from './sign-out-button'

const NAV = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/wishlist', label: 'Wishlist' },
  { href: '/account/password', label: 'Password' },
] as const

/** Overview only on itself; every other section also covers its sub-pages (an order of yours). */
function isCurrent(href: string, pathname: string): boolean {
  return href === '/account' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * A client component only to read the path for the current-section marker.
 * Wraps on phones: a single non-wrapping row was wider than the screen and
 * stretched every account page with it.
 */
export function AccountNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Account"
      className="flex flex-wrap gap-1 border-y border-line py-3 md:flex-col md:flex-nowrap md:border-y-0 md:border-r md:pr-6"
    >
      {NAV.map((n) => {
        const current = isCurrent(n.href, pathname)
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'rounded px-3 py-2 text-[14px] hover:bg-line hover:text-ink',
              current ? 'bg-line font-medium text-ink' : 'text-ink-soft',
            )}
          >
            {n.label}
          </Link>
        )
      })}
      <SignOutButton />
    </nav>
  )
}
