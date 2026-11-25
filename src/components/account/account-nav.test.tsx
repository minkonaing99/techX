// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

let pathname = '/account'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('./sign-out-button', () => ({ SignOutButton: () => <button type="button">Sign out</button> }))

const { AccountNav } = await import('./account-nav')

afterEach(cleanup)

function current(): string[] {
  return screen
    .getAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent ?? '')
}

describe('AccountNav', () => {
  it('marks the section you are in', () => {
    pathname = '/account/addresses'
    render(<AccountNav />)
    expect(current()).toEqual(['Addresses'])
  })

  it('keeps Orders marked on an order of yours', () => {
    pathname = '/account/orders/18fb7308-2089-4f77-b89a-e3ebc3e826b2'
    render(<AccountNav />)
    expect(current()).toEqual(['Orders'])
  })

  it('does not mark a section for a path that only starts with its name', () => {
    pathname = '/account/ordersX'
    render(<AccountNav />)
    expect(current()).toEqual([])
  })

  it('marks Overview only on the overview itself', () => {
    pathname = '/account'
    render(<AccountNav />)
    expect(current()).toEqual(['Overview'])
  })

  it('wraps on a phone instead of widening the page', () => {
    // A non-wrapping row of six links was 508 px wide and stretched every
    // account page past a 390 px screen.
    render(<AccountNav />)
    const nav = screen.getByRole('navigation', { name: /account/i }).className.split(' ')
    expect(nav).toContain('flex-wrap')
    // A single column on desktop, as before.
    expect(nav).toEqual(expect.arrayContaining(['md:flex-col', 'md:flex-nowrap']))
  })
})
