// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))
const api = vi.fn()
vi.mock('@/lib/api-client', () => ({ api: (...a: unknown[]) => api(...a) }))

const { ProfileForm } = await import('./profile-form')

afterEach(() => {
  cleanup()
  api.mockReset()
  refresh.mockReset()
})

describe('ProfileForm', () => {
  it('shows the name to edit, the sign-in email as fixed, and where the name appears', () => {
    render(<ProfileForm initialName="Min" email="a@b.co" />)
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Min')
    expect(screen.getByText('a@b.co')).toBeTruthy()
    expect(screen.queryByLabelText(/^Email/)).toBeNull()
    expect(screen.getByText(/Also shows on reviews you write/)).toBeTruthy()
    expect(screen.getByText('The account cannot be changed')).toBeTruthy()
    expect(screen.queryByText(/message us/)).toBeNull()
  })

  it('saves the new name and refreshes the page', async () => {
    api.mockResolvedValue({ ok: true, data: { name: 'Min Ko' } })
    render(<ProfileForm initialName="Min" email="a@b.co" />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Min Ko' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(api).toHaveBeenCalledWith('/api/v1/account/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Min Ko' }),
    })
  })
})
