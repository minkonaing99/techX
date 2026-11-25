'use client'

import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import { formatMmk } from '@/lib/money'
import { ProductDetailsForm, type ProductFormValues } from './product-details-form'
import { ProductPhotoGrid } from './product-photo-grid'
import { formIsDirty, rowToForm, type ExpandedSection, type Row } from './product-form'

interface ProductRowProps {
  row: Row
  /** Units unpaid orders are holding; they return to stock if those orders lapse. */
  held: number
  expanded: ExpandedSection | undefined
  draft: ProductFormValues | undefined
  saving: boolean
  onOpen: (section: ExpandedSection) => void
  onDelete: () => void
  onDraftChange: (next: ProductFormValues) => void
  onDiscard: () => void
  onSave: () => void
  onPhotosChange: (hasAny: boolean) => void
}

export function ProductRow(props: ProductRowProps) {
  const { row: r, expanded, draft, saving } = props
  const dirty = draft ? formIsDirty(rowToForm(r), draft) : false
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <RowTitle row={r} held={props.held} />
        <RowActions
          name={r.name}
          expanded={expanded}
          saving={saving}
          onOpen={props.onOpen}
          onDelete={props.onDelete}
        />
      </div>

      {expanded === 'details' && draft && (
        <RowDetailsPanel
          draft={draft}
          dirty={dirty}
          saving={saving}
          onChange={props.onDraftChange}
          onDiscard={props.onDiscard}
          onSave={props.onSave}
        />
      )}

      {expanded === 'photos' && (
        <div className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-5">
          <ProductPhotoGrid
            productId={r.id}
            slug={r.slug}
            swatch={r.swatch}
            onChange={props.onPhotosChange}
          />
        </div>
      )}
    </li>
  )
}

function RowTitle({ row: r, held }: { row: Row; held: number }) {
  return (
    <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
      <span title="Display order" className="w-8 shrink-0 pt-0.5 text-right text-[13px] tabular-nums text-muted">
        <span className="sr-only">Display order </span>
        {r.sortOrder}
      </span>
      <RowText row={r} held={held} />
    </div>
  )
}

function RowText({ row: r, held }: { row: Row; held: number }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 font-display text-[15px]">
        <Link
          href={`/product/${r.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-accent"
        >
          {r.name}
        </Link>
        {!r.isActive && (
          <span className="rounded-[var(--radius-pill)] bg-line px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-muted">
            inactive
          </span>
        )}
        {r.featured && (
          <span className="rounded-[var(--radius-pill)] bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-accent">
            featured
          </span>
        )}
        {!r.hasPhotos && (
          <span className="rounded-[var(--radius-pill)] bg-error/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-error">
            no photos
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[12px] text-muted">
        {r.slug} · {r.categoryId} · {formatMmk(r.priceMmk)}
        {r.salePriceMmk !== null && ` · sale ${formatMmk(r.salePriceMmk)}`} · stock {r.stockQty}
        {held > 0 && (
          <span title="Taken by unpaid orders. Goes back to stock if they expire or are cancelled.">
            {` · ${held} held`}
          </span>
        )}
      </div>
    </div>
  )
}

interface RowActionsProps {
  name: string
  expanded: ExpandedSection | undefined
  saving: boolean
  onOpen: (section: ExpandedSection) => void
  onDelete: () => void
}

function RowActions({ name, expanded, saving, onOpen, onDelete }: RowActionsProps) {
  return (
    <div className="flex gap-2 text-[12px]">
      <button
        onClick={() => onOpen('details')}
        className={`rounded-[var(--radius-pill)] border px-3 py-1 transition-colors ${
          expanded === 'details'
            ? 'border-ink bg-ink text-cream'
            : 'border-line text-ink hover:border-ink/40'
        }`}
      >
        Edit details
      </button>
      <button
        onClick={() => onOpen('photos')}
        className={`rounded-[var(--radius-pill)] border px-3 py-1 transition-colors ${
          expanded === 'photos'
            ? 'border-ink bg-ink text-cream'
            : 'border-line text-ink hover:border-ink/40'
        }`}
      >
        Edit photos
      </button>
      <button
        onClick={onDelete}
        disabled={saving}
        aria-label={`Delete ${name}`}
        className="rounded-[var(--radius-pill)] border border-line p-1.5 text-muted transition-colors hover:border-error/40 hover:text-error disabled:opacity-50"
      >
        <Trash2 size={14} strokeWidth={1.5} />
      </button>
    </div>
  )
}

interface RowDetailsPanelProps {
  draft: ProductFormValues
  dirty: boolean
  saving: boolean
  onChange: (next: ProductFormValues) => void
  onDiscard: () => void
  onSave: () => void
}

function RowDetailsPanel({ draft, dirty, saving, onChange, onDiscard, onSave }: RowDetailsPanelProps) {
  return (
    <div className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-5">
      <ProductDetailsForm values={draft} onChange={onChange} mode="edit" />
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {dirty && <span className="text-[12px] text-muted sm:mr-auto">Unsaved changes.</span>}
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={onDiscard}
          className="inline-flex items-center justify-center rounded-[var(--radius-pill)] border border-line bg-cream px-5 py-2 text-[13px] font-medium text-ink hover:border-ink/40 disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={onSave}
          className="inline-flex items-center justify-center rounded-[var(--radius-pill)] bg-ink px-6 py-2 text-[13px] font-medium text-cream transition-colors hover:bg-accent disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
