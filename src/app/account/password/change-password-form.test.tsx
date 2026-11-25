// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const signIn = vi.fn()
vi.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => signIn(...args) }))
const api = vi.fn()
vi.mock('@/lib/api-client', () => ({ api: (...args: unknown[]) => api(...args) }))
vi.mock('sonner', () => ({ toast: vi.fn() }))

const { ChangePasswordForm } = await import('./change-password-form')

afterEach(cleanup)

function input(label: RegExp): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement
}

describe('ChangePasswordForm show-password eyes', () => {
  it('lets the current password be shown', () => {
    render(<ChangePasswordForm email="a@b.co" hasPassword />)
    expect(input(/^Current password/).type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Show current password' }))
    expect(input(/^Current password/).type).toBe('text')
    expect(screen.getByRole('button', { name: 'Hide current password' })).toBeTruthy()
  })

  it('shows each field on its own', () => {
    render(<ChangePasswordForm email="a@b.co" hasPassword />)
    fireEvent.click(screen.getByRole('button', { name: 'Show current password' }))
    expect(input(/^New password/).type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Show new password' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hide current password' }))
    expect(input(/^Current password/).type).toBe('password')
    expect(input(/^New password/).type).toBe('text')
  })

  it('hides both again after a successful change', async () => {
    api.mockResolvedValue({ ok: true })
    signIn.mockResolvedValue({})
    render(<ChangePasswordForm email="a@b.co" hasPassword />)
    fireEvent.change(input(/^Current password/), { target: { value: 'Oldpassword1' } })
    fireEvent.change(input(/^New password/), { target: { value: 'Newpassword2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show current password' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show new password' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(input(/^Current password/).value).toBe(''))
    expect(input(/^Current password/).type).toBe('password')
    expect(input(/^New password/).type).toBe('password')
  })
})

describe('ChangePasswordForm wording', () => {
  it('spells out the password rule', () => {
    render(<ChangePasswordForm email="a@b.co" hasPassword />)
    expect(
      screen.getByText(
        'At least 10 characters, including an uppercase letter, a lowercase letter and a number.',
      ),
    ).toBeTruthy()
  })
})
