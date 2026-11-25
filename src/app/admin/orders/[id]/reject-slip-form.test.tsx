// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RejectSlipForm } from './reject-slip-form'

afterEach(cleanup)

function setup() {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  render(<RejectSlipForm busy={false} onSubmit={onSubmit} onCancel={onCancel} />)
  return { onSubmit, onCancel, send: () => screen.getByRole('button', { name: /send slip back/i }) as HTMLButtonElement }
}

describe('RejectSlipForm', () => {
  it('cannot be sent until a reason is chosen', () => {
    const { send } = setup()
    expect(send().disabled).toBe(true)
  })

  it('sends a preset reason, with any details after it', () => {
    const { onSubmit, send } = setup()
    fireEvent.click(screen.getByLabelText(/amount does not match/i))
    fireEvent.change(screen.getByLabelText(/details for the customer/i), { target: { value: 'You sent 540,000.' } })
    fireEvent.click(send())
    expect(onSubmit).toHaveBeenCalledWith('The amount on the slip does not match the order total. You sent 540,000.')
  })

  it('asks for details when "Other" is chosen, and sends them alone', () => {
    const { onSubmit, send } = setup()
    fireEvent.click(screen.getByLabelText(/^other$/i))
    expect(send().disabled).toBe(true)
    expect(screen.getByText(/write the reason/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/details for the customer/i), { target: { value: 'Slip is from another order.' } })
    fireEvent.click(send())
    expect(onSubmit).toHaveBeenCalledWith('Slip is from another order.')
  })

  it('will not send a reason over 500 characters after a switch to a longer preset', () => {
    const { send } = setup()
    fireEvent.click(screen.getByLabelText(/^other$/i))
    fireEvent.change(screen.getByLabelText(/details for the customer/i), { target: { value: 'x'.repeat(480) } })
    expect(send().disabled).toBe(false)
    fireEvent.click(screen.getByLabelText(/amount does not match/i))
    expect(send().disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toMatch(/too long by \d+ characters/i)
  })

  it('can be closed without sending anything', () => {
    const { onSubmit, onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: /keep reviewing/i }))
    expect(onCancel).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
