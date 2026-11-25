// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { OrderRow } from './order-row'
import type { AccountOrder } from '@/lib/account-orders'

afterEach(cleanup)

const ORDER: AccountOrder = {
  id: '1742a6d4-0000-4000-8000-000000000000',
  status: 'confirmed',
  totalMmk: 605_000,
  placedAt: '2026-10-25T08:00:00.000Z',
  methodName: 'KBZ Pay',
  methodKind: 'wallet',
  items: 'Kestrel 75 + 1 more',
}

function row(order: Partial<AccountOrder> = {}) {
  return render(<ul><OrderRow order={{ ...ORDER, ...order }} /></ul>)
}

describe('OrderRow', () => {
  it('says which order it is, what was bought, when, how it is paid and where it stands', () => {
    row()
    const link = screen.getByRole('link', { name: 'Order 1742A6D4' })
    expect(link.getAttribute('href')).toBe(`/account/orders/${ORDER.id}`)
    expect(screen.getByText('Kestrel 75 + 1 more')).toBeTruthy()
    expect(screen.getByText(/25 Oct 2026 · KBZ Pay ·/)).toBeTruthy()
    expect(screen.getByText('Confirmed')).toBeTruthy()
    expect(screen.getByText('Ks 605,000')).toBeTruthy()
  })

  it('marks an order still waiting for its transfer', () => {
    row({ status: 'pending_payment', methodKind: 'wallet' })
    expect(screen.getByText('Awaiting payment').className).toContain('text-accent')
  })

  it('leaves other statuses quiet', () => {
    row()
    expect(screen.getByText('Confirmed').className).not.toContain('text-accent')
  })

  it('does not repeat "pay on delivery" next to the payment method', () => {
    row({ status: 'confirmed', methodKind: 'cod', methodName: 'Cash on Delivery' })
    expect(screen.getByText('Confirmed')).toBeTruthy()
    expect(screen.queryByText(/pay on delivery/)).toBeNull()
  })

  it('keeps the total on one line on a phone', () => {
    row()
    expect(screen.getByText('Ks 605,000').className).toContain('whitespace-nowrap')
  })
})
