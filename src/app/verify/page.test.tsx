// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=t&email=a%40b.co'),
}))
vi.mock('@/lib/api-client', () => ({ api: vi.fn().mockResolvedValue({ ok: true }) }))
let items: unknown[] = []
vi.mock('@/lib/cart-store', () => ({
  useCart: (pick: (s: { items: unknown[] }) => unknown) => pick({ items }),
}))

const { default: VerifyPage } = await import('./page')

afterEach(cleanup)

async function signinHref(): Promise<string | null> {
  return (await screen.findByRole('link', { name: 'Sign in' })).getAttribute('href')
}

describe('VerifyPage', () => {
  // Opened from the email, often in a new tab: the cart is how it knows the
  // customer was on the way to checkout.
  it('leads back to checkout when this browser has a cart', async () => {
    items = [{ productId: 'k2', qty: 1 }]
    render(<VerifyPage />)
    expect(await signinHref()).toBe('/signin?callbackUrl=%2Fcheckout')
  })

  it('is a plain sign-in with an empty cart', async () => {
    items = []
    render(<VerifyPage />)
    expect(await signinHref()).toBe('/signin')
  })
})
