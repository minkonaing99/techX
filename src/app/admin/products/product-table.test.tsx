// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AdminProductTable } from './product-table'
import type { Row } from './product-form'

function row(id: string, over: Partial<Row> = {}): Row {
  return {
    id,
    name: id,
    slug: id,
    categoryId: 'mice',
    priceMmk: 100000,
    salePriceMmk: null,
    tagline: '',
    description: '',
    swatch: '#7A4F36',
    stockQty: 10,
    lowStockThreshold: 3,
    sortOrder: 0,
    featured: false,
    isActive: true,
    hasPhotos: true,
    specs: [],
    textVersion: 'a'.repeat(64),
    ...over,
  }
}

const ROWS = [
  row('aula-f75', { name: 'AULA F75', categoryId: 'keyboards', sortOrder: 0 }),
  row('atk-x1', { name: 'ATK X1 V2', stockQty: 1, sortOrder: 1 }),
  row('stand', { name: 'Laptop Stand', categoryId: 'accessories', hasPhotos: false, sortOrder: 2 }),
]

function names(): string[] {
  return within(screen.getByRole('list', { name: 'Products' }))
    .getAllByRole('link')
    .filter((a) => a.getAttribute('href')?.startsWith('/product/'))
    .map((a) => a.textContent ?? '')
}

afterEach(cleanup)

describe('AdminProductTable filters', () => {
  it('has no search box, only chips', () => {
    render(<AdminProductTable initial={ROWS} held={{}} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('shows category chips with counts and filters by one', () => {
    render(<AdminProductTable initial={ROWS} held={{}} />)
    const chip = screen.getByRole('button', { name: 'Keyboards 1' })
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(names()).toEqual(['AULA F75'])
  })

  it('toggles a needs-work chip on and off', () => {
    render(<AdminProductTable initial={ROWS} held={{}} />)
    const chip = screen.getByRole('button', { name: 'Low stock 1' })
    fireEvent.click(chip)
    expect(names()).toEqual(['ATK X1 V2'])
    fireEvent.click(chip)
    expect(names()).toHaveLength(3)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('says so when nothing matches, and Clear filters brings every product back', () => {
    render(<AdminProductTable initial={ROWS} held={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hidden 0' }))
    expect(screen.getByText('No products match these filters.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(names()).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Hidden 0' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('announces the result count in a status region that stays mounted', () => {
    render(<AdminProductTable initial={ROWS} held={{}} />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Mice 1' }))
    expect(status.textContent).toContain('Showing 1 of 3')
  })

  it('labels the chip groups', () => {
    render(<AdminProductTable initial={ROWS} held={{}} />)
    expect(screen.getByRole('group', { name: 'Category' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Needs work' })).toBeTruthy()
  })

  it('keeps an open row that stops matching, and counts only real matches', () => {
    render(<AdminProductTable initial={ROWS} held={{}} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit photos' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Mice 1' }))
    expect(names()).toEqual(['AULA F75', 'ATK X1 V2'])
    expect(screen.getByText('Showing 1 of 3')).toBeTruthy()
  })

  it('drops a kept row once its panel closes with nothing unsaved', () => {
    render(<AdminProductTable initial={ROWS} held={{}} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit details' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Mice 1' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit details' })[0]!)
    expect(names()).toEqual(['ATK X1 V2'])
  })

  it('keeps a row with unsaved edits after its panel closes', () => {
    render(<AdminProductTable initial={ROWS} held={{}} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit details' })[0]!)
    fireEvent.change(screen.getByDisplayValue('AULA F75'), { target: { value: 'AULA F75 Pro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mice 1' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit details' })[0]!)
    expect(names()).toEqual(['AULA F75', 'ATK X1 V2'])
  })
})

describe('AdminProductTable display order', () => {
  it('says how the display order sorts the shop, and where it does not', () => {
    render(<AdminProductTable initial={ROWS} held={{}} />)
    expect(
      screen.getByText(
        'The number before each name is its display order. On shop pages, featured products come first, then lower numbers, ties by name; sold-out products go last. Shoppers can re-sort by price or name, and the home page puts sales and low stock first.',
      ),
    ).toBeTruthy()
  })

  it('lists products by display order, then name', () => {
    const rows = [row('c', { name: 'Zeta', sortOrder: 2 }), row('a', { name: 'Beta', sortOrder: 0 }), row('b', { name: 'Alpha', sortOrder: 0 })]
    render(<AdminProductTable initial={rows} held={{}} />)
    expect(names()).toEqual(['Alpha', 'Beta', 'Zeta'])
  })
})
