import Link from 'next/link'
import Image from 'next/image'
import { CATEGORIES } from '@/lib/categories'

const STATIC_COLUMNS = [
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Support',
    links: [
      { href: '/shipping', label: 'Shipping' },
      { href: '/returns', label: 'Returns' },
      { href: '/returns#warranty', label: 'Warranty' },
      { href: '/faq', label: 'FAQ' },
    ],
  },
] as const

// Below 768px the menu already lists the categories, so the footer leaves
// them out and sets Company and Support side by side: the phone footer was
// taller than the screen.
const COLUMNS = [
  {
    title: 'Shop',
    links: CATEGORIES.map((c) => ({ href: `/shop/${c.id}`, label: c.name })),
    className: 'hidden md:block' as string | undefined,
  },
  ...STATIC_COLUMNS.map((c) => ({ ...c, className: undefined })),
]

export function Footer() {
  return (
    <footer className="mt-24 bg-[var(--color-dark-bg)] text-[var(--color-dark-ink)]">
      <div className="container-prose grid grid-cols-2 gap-x-4 gap-y-8 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)] md:gap-12 md:py-16">
        <div className="col-span-2 md:col-span-1">
          <Link href="/" className="flex items-center gap-3" aria-label="TechX home">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-cream/8 ring-1 ring-cream/15">
              <Image
                src="/logo.png"
                alt=""
                width={22}
                height={22}
                className="opacity-95 [filter:invert(1)_brightness(1.05)]"
              />
            </span>
            <span className="font-display text-[22px] font-medium">TechX</span>
          </Link>
          <p className="mt-4 max-w-[28ch] text-[14px] leading-relaxed text-cream/60">
            Tech gear, picked with care. Genuine stock, real warranty.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title} className={col.className}>
            <div className="text-[11px] tracking-[0.14em] uppercase text-cream/50">{col.title}</div>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-[14px] text-cream/85 transition-colors hover:text-[var(--color-accent-soft)]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-cream/10">
        <div className="container-prose flex flex-col items-start justify-between gap-3 py-6 text-[12px] text-cream/55 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} TechX. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="transition-colors hover:text-[var(--color-accent-soft)]"
            >
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
