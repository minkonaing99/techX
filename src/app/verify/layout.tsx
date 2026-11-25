import type { Metadata } from 'next'

// The verify page is a client component with a token in its URL, so its metadata lives here.
export const metadata: Metadata = { title: 'Verify email', robots: { index: false, follow: true } }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
