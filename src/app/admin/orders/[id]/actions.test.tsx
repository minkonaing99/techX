// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const api = vi.fn<(url: string, init: { body: string }) => Promise<{ ok: boolean; status: number }>>(async () => ({ ok: true, status: 200 }))
vi.mock('@/lib/api-client', () => ({ api: (url: string, init: { body: string }) => api(url, init) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: vi.fn() }))

const { AdminOrderActions } = await import('./actions')

afterEach(() => {
  cleanup()
  api.mockClear()
})

describe('AdminOrderActions sending a slip back', () => {
  it('asks for a reason before anything is sent', () => {
    render(<AdminOrderActions orderId="o1" status="payment_submitted" methodKind="wallet" hasSlip />)
    fireEvent.click(screen.getByRole('button', { name: /reject slip/i }))
    expect(api).not.toHaveBeenCalled()
    expect(screen.getByRole('group', { name: /why are you sending the slip back/i })).toBeTruthy()
  })

  it('sends the status with the reason', async () => {
    render(<AdminOrderActions orderId="o1" status="payment_submitted" methodKind="wallet" hasSlip />)
    fireEvent.click(screen.getByRole('button', { name: /reject slip/i }))
    fireEvent.click(screen.getByLabelText(/slip unreadable/i))
    fireEvent.click(screen.getByRole('button', { name: /send slip back/i }))
    await waitFor(() => expect(api).toHaveBeenCalledOnce())
    expect(JSON.parse(api.mock.calls[0]![1].body)).toEqual({
      status: 'pending_payment',
      reason: 'We could not read the slip image.',
    })
  })

  it('closes the form again on a second click', () => {
    render(<AdminOrderActions orderId="o1" status="payment_submitted" methodKind="wallet" hasSlip />)
    const reject = screen.getByRole('button', { name: /reject slip/i })
    fireEvent.click(reject)
    fireEvent.click(reject)
    expect(screen.queryByRole('group', { name: /why are you sending the slip back/i })).toBeNull()
  })
})
