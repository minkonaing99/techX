// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ProductRow } from './product-row'
import type { Row } from './product-form'

const ROW: Row = {
  id: 'p_1',
  name: 'Kestrel 75',
  slug: 'kestrel-75',
  categoryId: 'keyboards',
  priceMmk: 250000,
  salePriceMmk: null,
  tagline: 'A quiet board',
  description: 'Gasket mount.',
  swatch: '#7A4F36',
  stockQty: 4,
  lowStockThreshold: 3,
  sortOrder: 0,
  featured: false,
  isActive: true,
  hasPhotos: true,
  specs: [],
  textVersion: 'a'.repeat(64),
}

function renderRow(held: number) {
  render(
    <ul>
      <ProductRow
        row={ROW}
        held={held}
        expanded={null}
        draft={undefined}
        saving={false}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onDraftChange={vi.fn()}
        onDiscard={vi.fn()}
        onSave={vi.fn()}
        onPhotosChange={vi.fn()}
      />
    </ul>,
  )
}

afterEach(() => {
  cleanup()
})

describe('ProductRow stock line', () => {
  it('shows how many units unpaid orders are holding', () => {
    // Stock is what is left to sell. Without the held count, the number reads
    // short against the shelf and invites a "correction" that oversells.
    renderRow(2)
    expect(screen.getByText(/stock 4/)).toBeTruthy()
    expect(screen.getByText(/2 held/)).toBeTruthy()
  })

  it('says nothing about holds when there are none', () => {
    renderRow(0)
    expect(screen.queryByText(/held/)).toBeNull()
  })
})

describe('ProductRow display order', () => {
  it('shows the display order in front of the name', () => {
    renderRow(0)
    const order = screen.getByTitle('Display order')
    expect(order.textContent).toBe('Display order 0')
    const name = screen.getByRole('link', { name: 'Kestrel 75' })
    expect(order.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
