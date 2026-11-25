// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { customerStatusHint } from '@/lib/order-status'
import { SITE } from '@/lib/site-info'
import { StatusHint } from './status-hint'

afterEach(cleanup)

describe('StatusHint', () => {
  it('links Telegram where the confirmed hint sends the customer there', () => {
    render(<StatusHint status="confirmed" kind="wallet" deadline="24 Oct 2026, 20:52" />)
    expect(screen.getByText(customerStatusHint('confirmed', 'wallet')!)).toBeTruthy()
    const link = screen.getByRole('link', { name: `Message @${SITE.telegram} on Telegram` })
    expect(link.getAttribute('href')).toBe(`https://t.me/${SITE.telegram}`)
  })

  it('leaves the link out on a page that already has one', () => {
    render(<StatusHint status="confirmed" kind="wallet" deadline="24 Oct 2026, 20:52" telegramLink={false} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('adds no link where the hint does not mention Telegram', () => {
    render(<StatusHint status="confirmed" kind="cod" deadline="24 Oct 2026, 20:52" />)
    expect(screen.queryByRole('link')).toBeNull()
    cleanup()
    render(<StatusHint status="pending_payment" kind="wallet" deadline="24 Oct 2026, 20:52" />)
    expect(screen.getByText(/by 24 Oct 2026, 20:52 Myanmar time/)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders nothing when nothing is expected of anyone', () => {
    const { container } = render(<StatusHint status="delivered" kind="wallet" deadline="24 Oct 2026, 20:52" />)
    expect(container.innerHTML).toBe('')
  })
})
