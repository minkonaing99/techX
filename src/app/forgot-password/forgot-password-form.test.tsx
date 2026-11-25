// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@/lib/api-client', () => ({ api: vi.fn() }))

const { ForgotPasswordForm } = await import('./forgot-password-form')

afterEach(cleanup)

describe('ForgotPasswordForm', () => {
  it('says what is being reset and which email to give', () => {
    render(<ForgotPasswordForm />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reset your password.')
    expect(
      screen.getByText('Enter the email you signed up with and we will send a link.'),
    ).toBeTruthy()
  })
})
