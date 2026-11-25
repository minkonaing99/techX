// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

let query = ''
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }))
const signIn = vi.fn()
vi.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => signIn(...args) }))
const api = vi.fn()
vi.mock('@/lib/api-client', () => ({ api: (...args: unknown[]) => api(...args) }))

const { SignUpForm } = await import('./signup-form')

afterEach(() => {
  cleanup()
  signIn.mockReset()
  api.mockReset()
})

function signinHref(): string | null {
  return screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')
}

describe('SignUpForm from checkout', () => {
  it('says it is for checkout and that the cart is kept', () => {
    query = 'callbackUrl=/checkout'
    render(<SignUpForm hasGoogle />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Create an account to check out.')
    expect(screen.getByText('Checkout')).toBeTruthy()
    expect(
      screen.getByText('Your cart is saved. Once you are signed in, you come straight back to checkout.'),
    ).toBeTruthy()
  })

  it('keeps the way back through Google and the sign-in link', () => {
    query = 'callbackUrl=/checkout'
    render(<SignUpForm hasGoogle />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(signIn).toHaveBeenCalledWith('google', { callbackUrl: '/checkout' })
    expect(signinHref()).toBe('/signin?callbackUrl=%2Fcheckout')
  })

  it('keeps the way back after the verification email is sent', async () => {
    query = 'callbackUrl=/checkout'
    api.mockResolvedValue({ ok: true })
    render(<SignUpForm hasGoogle={false} />)
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'Abcdefghij1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Verify your email.')).toBeTruthy()
    expect(signinHref()).toBe('/signin?callbackUrl=%2Fcheckout')
  })
})

describe('SignUpForm elsewhere', () => {
  it('stays the plain sign-up and sends Google to the account', () => {
    query = ''
    render(<SignUpForm hasGoogle />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign up.')
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(signIn).toHaveBeenCalledWith('google', { callbackUrl: '/account' })
    expect(signinHref()).toBe('/signin')
  })

  it('spells out the password rule', () => {
    query = ''
    render(<SignUpForm hasGoogle={false} />)
    expect(
      screen.getByText(
        'At least 10 characters, including an uppercase letter, a lowercase letter and a number.',
      ),
    ).toBeTruthy()
  })
})
