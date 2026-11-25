// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

let query = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}))
const signIn = vi.fn()
vi.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => signIn(...args) }))

const { SignInForm } = await import('./signin-form')

afterEach(() => {
  cleanup()
  signIn.mockReset()
})

function signupHref(): string | null {
  return screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')
}

describe('SignInForm from checkout', () => {
  it('says it is for checkout and that the cart is kept', () => {
    query = 'callbackUrl=/checkout'
    render(<SignInForm hasGoogle />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign in to check out.')
    expect(screen.getByText('Checkout')).toBeTruthy()
    expect(screen.getByText('Your cart is saved. You come straight back here after signing in.')).toBeTruthy()
  })

  it('keeps the way back through sign-up and Google', () => {
    query = 'callbackUrl=/checkout'
    render(<SignInForm hasGoogle />)
    expect(signupHref()).toBe('/signup?callbackUrl=%2Fcheckout')
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(signIn).toHaveBeenCalledWith('google', { callbackUrl: '/checkout' })
  })
})

describe('SignInForm elsewhere', () => {
  it('stays the plain sign-in', () => {
    query = ''
    render(<SignInForm hasGoogle={false} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign in.')
    expect(screen.getByText('Welcome back')).toBeTruthy()
    expect(signupHref()).toBe('/signup')
  })

  it('does not pass on an off-site address', () => {
    query = 'callbackUrl=%2F%5Cevil.example'
    render(<SignInForm hasGoogle={false} />)
    expect(signupHref()).toBe('/signup')
  })
})

describe('SignInForm links', () => {
  // The email box is focused on load. Leaving it empty to tap a link used to
  // show "Email is required.", which pushed the link down under the pointer.
  it('does not flag an empty field just passed through', () => {
    query = ''
    render(<SignInForm hasGoogle={false} />)
    fireEvent.blur(screen.getByLabelText(/^Email/))
    fireEvent.blur(screen.getByLabelText(/^Password/))
    expect(screen.queryByText('Email is required.')).toBeNull()
    expect(screen.queryByText('Password is required.')).toBeNull()
  })

  it('still flags them on submit', () => {
    query = ''
    render(<SignInForm hasGoogle={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Email is required.')).toBeTruthy()
    expect(screen.getByText('Password is required.')).toBeTruthy()
  })
})
