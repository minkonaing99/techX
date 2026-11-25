import { formatMmk } from '@/lib/money'
import type { DayRevenue } from '@/lib/sales-report'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-10-23' -> '23 Oct'. */
function shortDay(day: string): string {
  const [, m, d] = day.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`
}

function DailyTable({ days }: { days: readonly DayRevenue[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left">
        <caption className="sr-only">Daily revenue, last 30 days</caption>
        <thead className="text-muted">
          <tr>
            <th scope="col" className="py-1 font-medium">Day</th>
            <th scope="col" className="py-1 font-medium">Orders</th>
            <th scope="col" className="py-1 text-right font-medium">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day} className="border-t border-line">
              <td className="py-1">{shortDay(d.day)}</td>
              <td className="py-1">{d.orders}</td>
              <td className="py-1 text-right font-mono">{formatMmk(d.revenueMmk)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Daily revenue as plain divs - no chart library for thirty bars. The bars are
 * hidden from screen readers; the same figures are a table under "Show daily
 * figures", which is also how a sighted owner reads exact numbers.
 */
export function RevenueBars({ days }: { days: readonly DayRevenue[] }) {
  const max = Math.max(0, ...days.map((d) => d.revenueMmk))

  return (
    <figure className="rounded-[var(--radius)] border border-line bg-surface p-6">
      <figcaption className="eyebrow">Daily revenue, last 30 days (Myanmar time)</figcaption>
      {max === 0 ? (
        <p className="mt-4 text-[14px] text-muted">No sales in the last 30 days.</p>
      ) : (
        <>
          <div aria-hidden="true" className="mt-5 flex h-32 items-end gap-[3px] border-b border-line">
            {days.map((d) => (
              <div
                key={d.day}
                title={`${shortDay(d.day)}: ${formatMmk(d.revenueMmk)} (${d.orders} ${d.orders === 1 ? 'order' : 'orders'})`}
                className="flex-1 rounded-t-[2px] bg-accent"
                style={{ height: d.revenueMmk ? `max(2px, ${(d.revenueMmk / max) * 100}%)` : '0' }}
              />
            ))}
          </div>
          <div aria-hidden="true" className="mt-1.5 flex justify-between text-[11px] text-muted">
            <span>{shortDay(days[0]!.day)}</span>
            <span>{shortDay(days[days.length - 1]!.day)}</span>
          </div>
          <details className="mt-4 text-[13px]">
            <summary className="cursor-pointer text-ink-soft">Show daily figures</summary>
            <DailyTable days={days} />
          </details>
        </>
      )}
    </figure>
  )
}
