// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }))
vi.mock('@/components/product/card', () => ({
  ProductCard: ({ product }: { product: { name: string } }) => <div>{product.name}</div>,
}))
let rows: { product: Record<string, unknown> }[] = []
vi.mock('@/db', () => {
  const c: Record<string, unknown> = {
    from: () => c,
    innerJoin: () => c,
    where: () => c,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  }
  return { db: { select: () => c } }
})

const { default: WishlistPage } = await import('./page')

afterEach(cleanup)

const SAVED = {
  id: 'p1',
  slug: 'viper-v3',
  name: 'Viper V3',
  categoryId: 'mice',
  priceMmk: '130000',
  salePriceMmk: null,
  tagline: '',
  description: '',
  swatch: '#111111',
  stockQty: 3,
  lowStockThreshold: 2,
  hasPhotos: false,
  featured: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

describe('WishlistPage', () => {
  it('points an empty wishlist at the shop', async () => {
    rows = []
    render(await WishlistPage())
    expect(screen.getByText('No saved products yet.')).toBeTruthy()
    expect(screen.getByText('Tap the heart on any product to save it here.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Visit the shop' }).getAttribute('href')).toBe('/shop')
  })

  it('shows saved products and no empty state', async () => {
    rows = [{ product: SAVED }]
    render(await WishlistPage())
    expect(screen.getByText('Viper V3')).toBeTruthy()
    expect(screen.queryByText('No saved products yet.')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Visit the shop' })).toBeNull()
  })
})
