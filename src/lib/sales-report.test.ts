import { describe, expect, it } from 'vitest'
import {
  dailyRevenue,
  formatMmDateTime,
  mmDayKey,
  mmDayStart,
  mmMonthStart,
  parseReportRange,
  reportWindowStart,
  summarizeSales,
  topProducts,
  type ItemLine,
  type SaleRow,
} from './sales-report'

// 11:30 in Myanmar (UTC+6:30). Myanmar midnight is 17:30Z the day before.
const NOW = new Date('2026-10-23T05:00:00Z')

function sale(placedAt: string, totalMmk: number, status: SaleRow['status'] = 'confirmed'): SaleRow {
  return { placedAt: new Date(placedAt), totalMmk, status }
}

describe('Myanmar calendar days', () => {
  it('puts a day boundary at 17:30 UTC', () => {
    expect(mmDayKey(new Date('2026-10-22T17:29:59Z'))).toBe('2026-10-22')
    expect(mmDayKey(new Date('2026-10-22T17:30:00Z'))).toBe('2026-10-23')
    expect(mmDayStart(NOW).toISOString()).toBe('2026-10-22T17:30:00.000Z')
    expect(mmDayStart(NOW, 6).toISOString()).toBe('2026-10-16T17:30:00.000Z')
  })

  it('starts the month on the 1st, Myanmar time', () => {
    expect(mmMonthStart(NOW).toISOString()).toBe('2026-09-30T17:30:00.000Z')
  })

  it('reads from the earlier of the 30-day and month starts', () => {
    expect(reportWindowStart(NOW).toISOString()).toBe('2026-09-23T17:30:00.000Z')
    const oct31 = new Date('2026-10-31T05:00:00Z')
    expect(reportWindowStart(oct31).toISOString()).toBe('2026-09-30T17:30:00.000Z')
  })

  it('rolls back across a month and a year', () => {
    const jan5 = new Date('2026-01-05T05:00:00Z')
    expect(mmDayStart(jan5, 29).toISOString()).toBe('2025-12-06T17:30:00.000Z')
    expect(mmMonthStart(jan5).toISOString()).toBe('2025-12-31T17:30:00.000Z')
    // 17:30Z on the last day of a month is already the 1st in Myanmar.
    expect(mmDayKey(new Date('2026-10-31T17:30:00Z'))).toBe('2026-11-01')
  })

  it('counts a leap day', () => {
    const days = dailyRevenue([sale('2028-02-29T05:00:00Z', 1)], new Date('2028-03-01T05:00:00Z'), 3)
    expect(days.map((d) => d.day)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
    expect(days[1]!.revenueMmk).toBe(1)
  })

  it('formats a time for the CSV in Myanmar time', () => {
    expect(formatMmDateTime(new Date('2026-10-22T17:45:00Z'))).toBe('2026-10-23 00:15')
  })
})

describe('summarizeSales', () => {
  it('counts only confirmed and delivered orders', () => {
    const s = summarizeSales(
      [
        sale('2026-10-23T01:00:00Z', 100_000),
        sale('2026-10-23T02:00:00Z', 50_000, 'delivered'),
        sale('2026-10-23T03:00:00Z', 999_000, 'pending_payment'),
        sale('2026-10-23T03:00:00Z', 999_000, 'payment_submitted'),
        sale('2026-10-23T03:00:00Z', 999_000, 'cancelled'),
      ],
      NOW,
    )
    expect(s.todayMmk).toBe(150_000)
    expect(s.orders30).toBe(2)
    expect(s.avgOrder30).toBe(75_000)
  })

  it('puts each order in the right windows, by Myanmar day', () => {
    const s = summarizeSales(
      [
        sale('2026-10-22T17:29:59Z', 1), // yesterday
        sale('2026-10-22T17:30:00Z', 10), // today
        sale('2026-10-16T17:30:00Z', 100), // first day of the 7
        sale('2026-10-16T17:29:59Z', 1_000), // just outside the 7
        sale('2026-09-23T17:30:00Z', 10_000), // first day of the 30, last month
        sale('2026-09-23T17:29:59Z', 100_000), // outside everything
        sale('2026-10-24T01:00:00Z', 1_000_000), // the future
      ],
      NOW,
    )
    expect(s.todayMmk).toBe(10)
    expect(s.d7Mmk).toBe(111)
    expect(s.d30Mmk).toBe(11_111)
    expect(s.monthMmk).toBe(1_111)
  })

  it('averages to a whole kyat, and to 0 with no orders', () => {
    expect(summarizeSales([sale('2026-10-23T01:00:00Z', 10), sale('2026-10-23T01:00:00Z', 11)], NOW).avgOrder30).toBe(11)
    expect(summarizeSales([], NOW)).toEqual({ todayMmk: 0, d7Mmk: 0, d30Mmk: 0, monthMmk: 0, orders30: 0, avgOrder30: 0 })
  })
})

describe('dailyRevenue', () => {
  it('gives 30 days oldest first, zero-filled, by Myanmar day', () => {
    const days = dailyRevenue([sale('2026-10-22T17:45:00Z', 5_000), sale('2026-10-22T10:00:00Z', 7_000)], NOW)
    expect(days).toHaveLength(30)
    expect(days[0]!.day).toBe('2026-09-24')
    expect(days[29]).toEqual({ day: '2026-10-23', revenueMmk: 5_000, orders: 1 })
    expect(days[28]).toEqual({ day: '2026-10-22', revenueMmk: 7_000, orders: 1 })
    expect(days[10]).toEqual({ day: '2026-10-04', revenueMmk: 0, orders: 0 })
  })
})

describe('topProducts', () => {
  function line(productId: string, qty: number, price: number, name = productId, at = '2026-10-20T00:00:00Z'): ItemLine {
    return { productId, nameSnapshot: name, qty, unitPriceMmkSnapshot: price, placedAt: new Date(at) }
  }

  it('ranks by units, then revenue, then name, capped at five', () => {
    const lines = [
      line('a', 3, 10),
      line('b', 3, 20),
      line('c', 5, 1),
      line('d', 1, 1),
      line('e', 1, 1),
      line('f', 1, 1),
      line('a', 1, 10),
    ]
    const top = topProducts(lines)
    expect(top.map((t) => t.productId)).toEqual(['c', 'a', 'b', 'd', 'e'])
    expect(top[1]).toEqual({ productId: 'a', name: 'a', units: 4, revenueMmk: 40 })
  })

  it('names a product by its latest snapshot and leaves the input alone', () => {
    const lines = [line('k2', 1, 5, 'K2 old', '2026-10-01T00:00:00Z'), line('k2', 1, 5, 'K2 Pro', '2026-10-20T00:00:00Z')]
    const copy = structuredClone(lines)
    expect(topProducts(lines)[0]!.name).toBe('K2 Pro')
    expect(lines).toEqual(copy)
  })
})

describe('parseReportRange', () => {
  it('takes inclusive Myanmar dates', () => {
    expect(parseReportRange('2026-10-23', '2026-10-23')).toEqual({
      start: new Date('2026-10-22T17:30:00Z'),
      endExclusive: new Date('2026-10-23T17:30:00Z'),
    })
  })

  it('refuses missing, malformed, impossible and reversed dates', () => {
    for (const [from, to] of [
      [null, '2026-10-23'],
      ['2026-10-1', '2026-10-23'],
      ['2026-02-30', '2026-03-01'],
      ['2026-10-23', '2026-10-01'],
    ] as const) {
      expect(parseReportRange(from, to)).toHaveProperty('error')
    }
  })

  it('allows up to 366 days', () => {
    expect(parseReportRange('2025-10-23', '2026-10-23')).not.toHaveProperty('error')
    expect(parseReportRange('2025-10-22', '2026-10-23')).toHaveProperty('error')
    // A whole leap year is 366 days.
    expect(parseReportRange('2028-01-01', '2028-12-31')).not.toHaveProperty('error')
    expect(parseReportRange('2027-12-31', '2028-12-31')).toHaveProperty('error')
  })
})
