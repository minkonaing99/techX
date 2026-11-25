'use client'

import { CATEGORIES } from '@/lib/categories'
import { cn } from '@/lib/utils'
import { NEEDS_WORK, type FilterCounts, type NeedsWork, type ProductFilter } from './product-filters'

interface Props {
  filter: ProductFilter
  counts: FilterCounts
  onChange: (next: ProductFilter) => void
}

export function ProductFiltersBar({ filter, counts, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
        <Chip label="All" count={counts.all} active={filter.category === ''} onClick={() => onChange({ ...filter, category: '' })} />
        {CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            count={counts.categories[c.id] ?? 0}
            active={filter.category === c.id}
            onClick={() => onChange({ ...filter, category: c.id })}
          />
        ))}
      </div>

      <div role="group" aria-labelledby="needs-work-label" className="flex flex-wrap items-center gap-2">
        <span id="needs-work-label" className="text-[12px] text-muted">
          Needs work
        </span>
        {NEEDS_WORK.map((n) => (
          <Chip
            key={n.value}
            label={n.label}
            count={counts.flags[n.value]}
            active={filter.flag === n.value}
            onClick={() => onChange({ ...filter, flag: toggle(filter.flag, n.value) })}
          />
        ))}
      </div>
    </div>
  )
}

function toggle(current: NeedsWork | null, value: NeedsWork): NeedsWork | null {
  return current === value ? null : value
}

interface ChipProps {
  label: string
  count: number
  active: boolean
  onClick: () => void
}

function Chip({ label, count, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-[var(--radius-pill)] px-3 py-1.5 text-[12px] transition-colors',
        active ? 'bg-ink text-cream' : 'border border-line text-ink-soft hover:border-ink/30 hover:text-ink',
      )}
    >
      {label} <span className={active ? 'text-cream/60' : 'text-muted'}>{count}</span>
    </button>
  )
}
