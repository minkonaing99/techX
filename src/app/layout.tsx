import { Suspense } from 'react'
import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter, Noto_Sans_Myanmar } from 'next/font/google'
import { Toaster } from 'sonner'
import { Nav } from '@/components/nav'
import { Footer } from '@/components/footer'
import { CartDrawer } from '@/components/cart-drawer'
import { CartHydrator } from '@/components/cart-hydrator'
import { WishlistHydrator } from '@/components/wishlist/wishlist-hydrator'
import { MotionProvider } from '@/components/motion-provider'
import { AuthProvider } from '@/components/auth-provider'
import { NavProgress } from '@/components/nav-progress'
import './globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT'],
})

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

// Inter and Fraunces carry no Burmese glyphs - the /my/* content pages need this.
// Not preloaded: only `font-my` elements use it, and a preload put 151 KB ahead
// of the main image on every English page. The browser fetches it on demand.
const notoMyanmar = Noto_Sans_Myanmar({
  subsets: ['myanmar'],
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: false,
  variable: '--font-noto-myanmar',
})

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://techx-store.online'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'TechX - tech gear, picked with care',
    template: '%s · TechX',
  },
  description:
    'Keyboards, mice, monitors, audio and accessories. Picked slowly, so you only buy once.',
  applicationName: 'TechX',
  icons: { icon: '/favicon.ico' },
  openGraph: {
    type: 'website',
    title: 'TechX - tech gear, picked with care',
    description:
      'Keyboards, mice, monitors, audio and accessories. Picked slowly, so you only buy once.',
    siteName: 'TechX',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TechX',
    description: 'Tech gear, picked with care.',
    images: ['/logo.png'],
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#F7F6F3',
  colorScheme: 'light',
}

/**
 * The CSP nonce in `src/middleware.ts` is minted per request, so a page has to
 * be rendered per request for Next to stamp it onto the script tags it emits.
 * Prerendered HTML is built without one, and under a nonce policy every script
 * on it is refused - the page arrives as dead markup.
 *
 * This costs static generation on the content pages (about, faq, legal, the
 * Burmese mirrors, signin/signup). None of them query the database, so the
 * per-request work is React rendering only. Remove this line and the
 * `'unsafe-inline'` fallback returns in `src/lib/csp.ts`.
 */
export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${notoMyanmar.variable}`}
    >
      <body className="bg-cream text-ink min-h-screen flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-ink text-cream px-3 py-2 rounded z-50"
        >
          Skip to content
        </a>
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <AuthProvider>
          <MotionProvider>
            <Nav />
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer />
            <CartDrawer />
            <CartHydrator />
            <WishlistHydrator />
          </MotionProvider>
        </AuthProvider>
        {/*
          Top-center, docked under the 64px sticky nav, near the cart button the
          toast is talking about. The bottom-right corner is where the cart
          drawer parks its own "View cart" footer, so a toast landing there
          covers the control it is pointing at.

          5s rather than the 4s default: these toasts carry an action now, and
          the reader has to notice it, aim, and click.
        */}
        <Toaster
          position="top-center"
          offset={{ top: 76 }}
          mobileOffset={{ top: 76 }}
          duration={5000}
          toastOptions={{
            style: {
              background: 'var(--color-surface)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-line)',
            },
          }}
        />
      </body>
    </html>
  )
}
