import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SignUpForm } from './signup-form'

export const metadata: Metadata = { title: 'Sign up', robots: { index: false, follow: true } }

export default function SignupPage() {
  const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
  // useSearchParams needs a Suspense boundary, as on the sign-in page.
  return (
    <Suspense
      fallback={<div className="mx-auto w-full max-w-[26rem] px-5 py-14 text-muted sm:py-20" />}
    >
      <SignUpForm hasGoogle={hasGoogle} />
    </Suspense>
  )
}
