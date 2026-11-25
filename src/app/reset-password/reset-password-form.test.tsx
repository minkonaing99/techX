// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=t&email=a%40b.co'),
}))
vi.mock('@/lib/api-client', () => ({ api: vi.fn() }))

const { ResetPasswordForm } = await import('./reset-password-form')

afterEach(cleanup)

describe('ResetPasswordForm', () => {
  it('spells out the password rule', () => {
    render(<ResetPasswordForm />)
    expect(
      screen.getByText(
        'At least 10 characters, including an uppercase letter, a lowercase letter and a number.',
      ),
    ).toBeTruthy()
  })
})
