// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RevenueBars } from './revenue-bars'
import type { DayRevenue } from '@/lib/sales-report'

afterEach(cleanup)

function days(revenue: (i: number) => number): DayRevenue[] {
  return Array.from({ length: 30 }, (_, i) => ({
    day: `2026-10-${String(i + 1).padStart(2, '0')}`,
    revenueMmk: revenue(i),
    orders: revenue(i) ? 1 : 0,
  }))
}

describe('RevenueBars', () => {
  it('draws the bars for sighted users and hides them from screen readers', () => {
    const { container } = render(<RevenueBars days={days((i) => i * 1000)} />)
    const bars = container.querySelector('[aria-hidden="true"]')
    expect(bars?.children).toHaveLength(30)
  })

  it('carries the same figures as a table anyone can open', () => {
    render(<RevenueBars days={days((i) => (i === 29 ? 548_000 : 0))} />)
    const table = screen.getByRole('table', { name: /daily revenue/i })
    expect(table.querySelectorAll('tbody tr')).toHaveLength(30)
    expect(table.textContent).toContain('548,000')
  })

  it('says so when there were no sales, instead of an empty chart', () => {
    render(<RevenueBars days={days(() => 0)} />)
    expect(screen.getByText(/no sales in the last 30 days/i)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
