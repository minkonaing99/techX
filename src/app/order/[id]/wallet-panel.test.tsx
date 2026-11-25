// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WalletPanel } from './wallet-panel'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ api: vi.fn() }))

afterEach(cleanup)

function renderPanel() {
  return render(
    <WalletPanel
      orderId="0b6f2c1e-1111-4222-8333-944445555666"
      totalMmk={250_000}
      method={{ name: 'KBZ Bank', accountName: 'TechX', accountPhone: '0123456789', qrImageUrl: null, instructionsMd: null }}
      telegramUrl={null}
      existingProofUrl={null}
    />,
  )
}

describe('WalletPanel slip form, by keyboard and screen reader', () => {
  it('names the file picker, and keeps it in the tab order', () => {
    renderPanel()
    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement
    expect(input.type).toBe('file')
    // `hidden` is display:none, which takes it out of the tab order entirely.
    expect(input.className).not.toMatch(/(^|\s)hidden(\s|$)/)
    expect(input.className).toContain('sr-only')
    // The input is invisible, so the pill around it carries the focus ring.
    expect(input.closest('label')!.className).toContain('has-[:focus-visible]:outline-accent')
  })

  it('announces the chosen file name', () => {
    renderPanel()
    const input = screen.getByLabelText(/choose file/i)
    fireEvent.change(input, { target: { files: [new File(['x'], 'slip.png', { type: 'image/png' })] } })
    const status = screen.getByText('Selected file: slip.png')
    expect(status.getAttribute('aria-live')).toBe('polite')
  })

  it('labels the transaction reference', () => {
    renderPanel()
    const ref = screen.getByLabelText(/transaction reference/i) as HTMLInputElement
    expect(ref.type).toBe('text')
    // No outline suppression, so the global :focus-visible ring shows.
    expect(ref.className).not.toContain('outline-none')
  })
})
