import type { SalesReport } from '@/lib/admin-sales'
import { formatMmk } from '@/lib/money'
import { RevenueBars } from './revenue-bars'

interface SalesOverviewProps {
  report: SalesReport
  /** 'YYYY-MM-DD' in Myanmar time: the export form's defaults and limit. */
  today: string
  monthStart: string
}

function Tile({ label, value, note, href }: { label: string; value: string; note?: string; href?: string }) {
  const body = (
    <>
      <div className="eyebrow">{label}</div>
      <div className="mt-2 font-display text-[28px] leading-none text-ink">{value}</div>
      {note && <div className="mt-1.5 text-[12px] text-muted">{note}</div>}
    </>
  )
  const cls = 'rounded-[var(--radius)] border border-line bg-surface p-5'
  return href ? (
    <a href={href} className={`${cls} transition-colors hover:border-ink/40`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function TopProducts({ top }: { top: SalesReport['top'] }) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-6">
      <h3 className="eyebrow">Top products, 30 days</h3>
      {top.length === 0 ? (
        <p className="mt-4 text-[14px] text-muted">No sales yet.</p>
      ) : (
        <ol className="mt-4 space-y-2 text-[14px]">
          {top.map((p, i) => (
            <li key={p.productId} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-ink">
                {i + 1}. {p.name}
              </span>
              <span className="shrink-0 text-muted">
                {p.units} sold, {formatMmk(p.revenueMmk)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function ExportForm({ today, monthStart }: { today: string; monthStart: string }) {
  return (
    <form
      method="get"
      action="/api/v1/admin/reports/orders.csv"
      className="rounded-[var(--radius)] border border-line bg-surface p-6"
    >
      <h3 className="eyebrow">Export orders (CSV)</h3>
      <div className="mt-4 flex flex-wrap items-end gap-3 text-[13px]">
        <label className="flex flex-col gap-1">
          <span className="text-muted">From</span>
          <input
            type="date"
            name="from"
            required
            defaultValue={monthStart}
            max={today}
            className="rounded-[var(--radius)] border border-line bg-cream px-3 py-2 text-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">To</span>
          <input
            type="date"
            name="to"
            required
            defaultValue={today}
            max={today}
            className="rounded-[var(--radius)] border border-line bg-cream px-3 py-2 text-ink"
          />
        </label>
        <button
          type="submit"
          className="rounded-[var(--radius-pill)] bg-ink px-5 py-2.5 font-medium text-cream transition-colors hover:bg-accent"
        >
          Download
        </button>
      </div>
      <p className="mt-3 text-[12px] text-muted">Myanmar dates, both days included, up to 366 days.</p>
    </form>
  )
}

/**
 * Revenue counts confirmed and delivered orders on the Myanmar day they were
 * placed (there is no confirmation date), delivery fee included. Definitions:
 * docs/ADMIN.md, "Sales".
 */
export function SalesOverview({ report, today, monthStart }: SalesOverviewProps) {
  const cod = report.codToCollect
  return (
    <section aria-labelledby="sales-heading" className="space-y-4">
      <h2 id="sales-heading" className="font-display text-[22px] text-ink">
        Sales
      </h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Today" value={formatMmk(report.todayMmk)} />
        <Tile label="Last 7 days" value={formatMmk(report.d7Mmk)} />
        <Tile label="Last 30 days" value={formatMmk(report.d30Mmk)} />
        <Tile label="This month" value={formatMmk(report.monthMmk)} />
        <Tile label="Orders, 30 days" value={String(report.orders30)} />
        <Tile label="Average order, 30 days" value={formatMmk(report.avgOrder30)} />
        <Tile
          label="COD to collect"
          value={formatMmk(cod.totalMmk)}
          note={`${cod.orders} ${cod.orders === 1 ? 'order' : 'orders'} confirmed, not delivered`}
          href="/admin/orders?status=confirmed"
        />
      </div>

      <RevenueBars days={report.daily} />

      <div className="grid gap-4 md:grid-cols-2">
        <TopProducts top={report.top} />
        <ExportForm today={today} monthStart={monthStart} />
      </div>
    </section>
  )
}
