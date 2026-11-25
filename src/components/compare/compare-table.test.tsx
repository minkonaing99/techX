// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CompareTable } from './compare-table'
import type { Product } from '@/lib/types'

afterEach(cleanup)

function product(over: Partial<Product>): Product {
  return {
    id: 'p', slug: 'p', name: 'P', category: 'mice', price: 545_000, salePrice: null, tagline: '',
    description: '', specs: [], swatch: '#000', inStock: true, hasPhotos: false, stockQty: 3,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  }
}

describe('CompareTable prices', () => {
  it('shows a sold-out product at its full price, with no sale', () => {
    render(
      <CompareTable
        a={product({ id: 'a', slug: 'a', name: 'Sold out', salePrice: 200_000, stockQty: 0, inStock: false })}
        b={product({ id: 'b', slug: 'b', name: 'In stock', price: 600_000, salePrice: 499_000 })}
        ratings={{}}
      />,
    )
    expect(screen.queryByText('Ks 200,000')).toBeNull()
    expect(screen.getByText('Ks 545,000')).toBeTruthy()
    // The in-stock product keeps its sale.
    expect(screen.getByText('Ks 499,000')).toBeTruthy()
    expect(screen.getAllByText(/% off/)).toHaveLength(1)
  })

  // Fixed columns: a sale pair on one unwrappable row ran into the next column.
  it('stacks a sale pair on a phone so it stays in its column', () => {
    render(
      <CompareTable
        a={product({ id: 'a', slug: 'a', name: 'On sale', price: 150_000, salePrice: 100_000 })}
        b={product({ id: 'b', slug: 'b', name: 'Plain', price: 568_000 })}
        ratings={{}}
      />,
    )
    expect(screen.getByLabelText('Was Ks 150,000, now Ks 100,000').className).toContain('flex-col')
  })
})
