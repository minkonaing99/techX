'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ProductCard } from '../product/card'
import { cn } from '@/lib/utils'
import type { Product } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { sortForGrid, type GridSort } from '@/lib/merchandising'

interface GridControlsProps {
  all: readonly Product[]
  activeCategory?: string
}

export function GridControls({ all, activeCategory }: GridControlsProps) {
  const [sort, setSort] = useState<GridSort>('featured')

  const sorted = useMemo(() => sortForGrid(all, sort), [all, sort])
  const chipRow = useRef<HTMLDivElement>(null)

  // On a phone the row scrolls, and a later category would start off-screen.
  // Horizontal only: scrollIntoView would also move the page.
  useEffect(() => {
    const row = chipRow.current
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]')
    if (row && active) row.scrollLeft = active.offsetLeft - row.offsetLeft - 20
  }, [activeCategory])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line pb-4 md:pb-5">
        {/* One scrolling row on a phone instead of two wrapped ones. */}
        {/* py-1 -my-1 leaves room for the focus ring, which the scroll box clips. */}
        <div
          ref={chipRow}
          className="-mx-5 -my-1 flex w-[calc(100%+2.5rem)] items-center gap-1.5 overflow-x-auto px-5 py-1 sm:mx-0 sm:my-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0"
        >
          <Link
            href="/shop"
            aria-current={!activeCategory ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-[var(--radius-pill)] border px-3.5 py-1.5 text-[13px] transition-colors',
              !activeCategory
                ? 'border-ink bg-ink text-cream'
                : 'border-line bg-cream text-ink-soft hover:border-ink/40',
            )}
          >
            All
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={`/shop/${c.id}`}
              aria-current={activeCategory === c.id ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-[var(--radius-pill)] border px-3.5 py-1.5 text-[13px] transition-colors',
                activeCategory === c.id
                  ? 'border-ink bg-ink text-cream'
                  : 'border-line bg-cream text-ink-soft hover:border-ink/40',
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <p className="mr-auto text-[13px] text-muted sm:mr-3">
            {sorted.length} {sorted.length === 1 ? 'product' : 'products'}
          </p>
          <label htmlFor="sort" className="text-[12px] text-muted">
            Sort
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as GridSort)}
            className="rounded-[var(--radius-pill)] border border-line bg-cream px-3 py-1.5 text-[13px] focus:outline-none"
          >
            <option value="featured">Featured</option>
            <option value="price-asc">Price · low to high</option>
            <option value="price-desc">Price · high to low</option>
            <option value="name-asc">Name · A→Z</option>
          </select>
        </div>
      </div>

      <div className="mt-5 md:mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 md:gap-10 lg:grid-cols-3">
        {sorted.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      {sorted.length === 0 && (
        <div className="rounded-[var(--radius)] border border-line bg-surface px-6 py-16 text-center">
          <p className="font-display text-[22px]">Nothing here yet.</p>
          <p className="mt-2 text-[14px] text-muted">This batch is empty. Check back next month.</p>
        </div>
      )}
    </>
  )
}
