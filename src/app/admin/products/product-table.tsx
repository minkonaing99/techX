'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { ProductDetailsForm, type ProductFormValues } from './product-details-form'
import { filterCounts, filterRows, isFiltering, NO_FILTER } from './product-filters'
import { ProductFiltersBar } from './product-filters-bar'
import { ProductRow } from './product-row'
import { formIsDirty, rowToForm, type Row } from './product-form'
import { useProductRows } from './use-product-rows'

interface Props {
  initial: Row[]
  /** Units held by unpaid orders, by product id. */
  held: Record<string, number>
}

export function AdminProductTable({ initial, held }: Props) {
  const t = useProductRows(initial)
  const [filter, setFilter] = useState(NO_FILTER)
  // Same order as the shop's base order, so a new or re-numbered product lands where it will show.
  const sorted = useMemo(
    () => [...t.rows].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [t.rows],
  )
  const counts = useMemo(() => filterCounts(t.rows), [t.rows])
  // Rows being edited stay in view even when they stop matching.
  const open = useMemo(
    () =>
      new Set(
        t.rows
          .filter((r) => t.expanded[r.id] || (t.drafts[r.id] && formIsDirty(rowToForm(r), t.drafts[r.id]!)))
          .map((r) => r.id),
      ),
    [t.rows, t.expanded, t.drafts],
  )
  const visible = filterRows(sorted, filter, open)
  const matches = filterRows(t.rows, filter).length
  const filtering = isFiltering(filter)

  async function create() {
    if (await t.createProduct()) setFilter(NO_FILTER)
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <ProductFiltersBar filter={filter} counts={counts} onChange={setFilter} />
          <div className="flex min-h-5 items-center gap-3 text-[12px]">
            <p role="status" className="text-muted">
              {filtering ? `Showing ${matches} of ${t.rows.length}` : ''}
            </p>
            {filtering && visible.length > 0 && <ClearFilters onClick={() => setFilter(NO_FILTER)} />}
          </div>
        </div>
        <button
          onClick={() => t.setCreating((c) => !c)}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-ink px-4 py-2 text-[13px] font-medium text-cream transition-colors hover:bg-accent"
        >
          <Plus size={14} strokeWidth={2} />
          {t.creating ? 'Close form' : 'New product'}
        </button>
      </div>

      {t.creating && (
        <NewProductPanel
          values={t.newDraft}
          onChange={t.setNewDraft}
          saving={t.savingNew}
          onCancel={t.cancelCreate}
          onCreate={create}
        />
      )}

      <p className="text-[12px] text-muted">
        The number before each name is its display order. On shop pages, featured products come first, then lower
        numbers, ties by name; sold-out products go last. Shoppers can re-sort by price or name, and the home page puts
        sales and low stock first.
      </p>

      <ul aria-label="Products" className="divide-y divide-line border-y border-line">
        {visible.map((r) => (
          <ProductRow
            key={r.id}
            row={r}
            held={held[r.id] ?? 0}
            expanded={t.expanded[r.id]}
            draft={t.drafts[r.id]}
            saving={Boolean(t.savingRow[r.id])}
            onOpen={(section) => t.openSection(r.id, section)}
            onDelete={() => t.deleteRow(r.id)}
            onDraftChange={(v) => t.updateDraft(r.id, v)}
            onDiscard={() => t.discardDraft(r.id)}
            onSave={() => t.saveRow(r.id)}
            onPhotosChange={(hasAny) => t.markHasPhotos(r.id, hasAny)}
          />
        ))}
        {t.rows.length === 0 && (
          <li className="py-10 text-center text-[14px] text-muted">
            No products yet. Click <strong>+ New product</strong> to add the first one.
          </li>
        )}
        {t.rows.length > 0 && visible.length === 0 && (
          <li className="py-10 text-center text-[14px] text-muted">
            No products match these filters. <ClearFilters onClick={() => setFilter(NO_FILTER)} />
          </li>
        )}
      </ul>
    </div>
  )
}

function ClearFilters({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-ink underline underline-offset-2 hover:text-accent">
      Clear filters
    </button>
  )
}

interface NewProductPanelProps {
  values: ProductFormValues
  onChange: (next: ProductFormValues) => void
  saving: boolean
  onCancel: () => void
  onCreate: () => void
}

function NewProductPanel({ values, onChange, saving, onCancel, onCreate }: NewProductPanelProps) {
  return (
    <article className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 md:p-6">
      <h3 className="font-display text-[18px]">New product</h3>
      <ProductDetailsForm values={values} onChange={onChange} mode="create" />
      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-[var(--radius-pill)] border border-line bg-cream px-5 py-2 text-[13px] font-medium text-ink hover:border-ink/40 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onCreate}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-[var(--radius-pill)] bg-ink px-6 py-2 text-[13px] font-medium text-cream transition-colors hover:bg-accent disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create product'}
        </button>
      </div>
    </article>
  )
}
