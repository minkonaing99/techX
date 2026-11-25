import type { Metadata } from 'next'

// The cart UI is a client component (cart-view.tsx); its title and noindex stay here.
export const metadata: Metadata = { title: 'Cart', robots: { index: false, follow: true } }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
