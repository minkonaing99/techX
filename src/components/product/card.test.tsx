// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AddResult } from '@/lib/cart-store'
import type { Product } from '@/lib/types'
import { ProductCard } from './card'

const { add, open, toast } = vi.hoisted(() => ({
  add: vi.fn(),
  open: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}))

vi.mock('@/lib/cart-store', () => ({
  useCart: (select: (s: { add: unknown; open: unknown }) => unknown) => select({ add, open }),
}))

vi.mock('sonner', () => ({ toast }))

const { saveToWishlist, removeFromWishlist, wishlist } = vi.hoisted(() => ({
  saveToWishlist: vi.fn(),
  removeFromWishlist: vi.fn(),
  wishlist: { ids: new Set<string>() },
}))
vi.mock('@/lib/wishlist-store', () => ({
  useWishlist: (select: (s: { ids: Set<string>; add: unknown; remove: unknown }) => unknown) =>
    select({ ids: wishlist.ids, add: saveToWishlist, remove: removeFromWishlist }),
}))

const PRODUCT: Product = {
  id: 'vxe-dragonfly-r1-se',
  slug: 'vxe-dragonfly-r1-se',
  name: 'VXE Dragonfly R1 SE+',
  category: 'mice',
  price: 130_000,
  salePrice: null,
  tagline: 'Light where it counts.',
  description: 'A featherweight wireless mouse.',
  specs: [],
  swatch: '#111111',
  inStock: true,
  hasPhotos: false,
  stockQty: 4,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function quickAdd(): HTMLButtonElement {
  return screen.getByRole('button', { name: /add vxe dragonfly r1 se\+ to cart/i })
}

/**
 * The card animates itself in with `whileInView`, and framer-motion reaches
 * for an IntersectionObserver the moment it mounts. jsdom has none. Nothing
 * here asserts on the entrance, so an inert stub is enough.
 */
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  wishlist.ids = new Set()
  vi.stubGlobal('IntersectionObserver', NoopIntersectionObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ProductCard quick add', () => {
  it('adds without leaving the grid', async () => {
    add.mockResolvedValue({ ok: true } satisfies AddResult)
    render(<ProductCard product={PRODUCT} />)

    fireEvent.click(quickAdd())

    await waitFor(() => expect(toast).toHaveBeenCalledOnce())
    expect(add).toHaveBeenCalledWith('vxe-dragonfly-r1-se', 1)
    expect(toast).toHaveBeenCalledWith(
      'Added - VXE Dragonfly R1 SE+',
      expect.objectContaining({ action: expect.objectContaining({ label: 'View cart' }) }),
    )
    // The whole card is a link to the product page - a quick add must not
    // navigate away from the grid the shopper is working through.
    expect(open).not.toHaveBeenCalled()
  })

  it('opens the drawer only when the toast action is taken', async () => {
    add.mockResolvedValue({ ok: true } satisfies AddResult)
    render(<ProductCard product={PRODUCT} />)

    fireEvent.click(quickAdd())
    await waitFor(() => expect(toast).toHaveBeenCalledOnce())

    const [, options] = toast.mock.calls[0] as [string, { action: { onClick: () => void } }]
    options.action.onClick()

    expect(open).toHaveBeenCalledOnce()
  })

  it('reports the server reason instead of a false confirmation', async () => {
    add.mockResolvedValue({ ok: false, message: 'Out of stock.' } satisfies AddResult)
    render(<ProductCard product={PRODUCT} />)

    fireEvent.click(quickAdd())

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Out of stock.'))
    expect(toast).not.toHaveBeenCalled()
  })

  it('collapses a burst of clicks into one add', async () => {
    const d = deferred<AddResult>()
    add.mockReturnValue(d.promise)
    render(<ProductCard product={PRODUCT} />)

    fireEvent.click(quickAdd())
    await waitFor(() => expect(quickAdd().disabled).toBe(true))
    fireEvent.click(quickAdd())
    fireEvent.click(quickAdd())

    expect(add).toHaveBeenCalledOnce()

    d.resolve({ ok: true })
    await waitFor(() => expect(quickAdd().disabled).toBe(false))
  })

})

describe('ProductCard when sold out', () => {
  const SOLD_OUT: Product = { ...PRODUCT, stockQty: 0, inStock: false }

  it('says so in words, not just with a faded button', () => {
    render(<ProductCard product={SOLD_OUT} />)
    expect(screen.getByText('Sold out')).toBeTruthy()
  })

  it('stops advertising a discount nobody can take', () => {
    const { container } = render(<ProductCard product={{ ...SOLD_OUT, salePrice: 50_000 }} />)
    expect(screen.queryByText(/% off/)).toBeNull()
    // No struck-through "was" price either: just the full price, muted.
    expect(container.querySelector('s')).toBeNull()
    expect(screen.queryByLabelText(/^Was /)).toBeNull()
    const price = screen.getByText('Ks 130,000')
    expect(price.className).toContain('text-muted')
  })

  it('dims the image under the chip', () => {
    render(<ProductCard product={SOLD_OUT} />)
    const chip = screen.getByText('Sold out')
    const tile = chip.previousElementSibling as HTMLElement
    expect(tile.className).toContain('opacity-55')
  })

  it('lets a saved sold-out product be taken off the wishlist', () => {
    wishlist.ids = new Set([PRODUCT.id])
    render(<ProductCard product={SOLD_OUT} />)
    const heart = screen.getByRole('button', { name: /remove vxe dragonfly r1 se\+ from wishlist/i })
    expect(heart.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(heart)
    expect(removeFromWishlist).toHaveBeenCalledWith('vxe-dragonfly-r1-se')
  })

  it('reads sold out from the in-stock flag when no count is known', () => {
    render(<ProductCard product={{ ...PRODUCT, stockQty: undefined, inStock: false }} />)
    expect(screen.getByText('Sold out')).toBeTruthy()
  })

  it('offers the wishlist in place of the add button', () => {
    render(<ProductCard product={SOLD_OUT} />)
    expect(screen.queryByRole('button', { name: /to cart/i })).toBeNull()

    const heart = screen.getByRole('button', { name: /save vxe dragonfly r1 se\+ to wishlist/i })
    // The card is a link to the product page; saving must not navigate away.
    const navigated = fireEvent.click(heart)

    expect(navigated).toBe(false)
    expect(saveToWishlist).toHaveBeenCalledWith('vxe-dragonfly-r1-se')
    expect(add).not.toHaveBeenCalled()
  })

  it('looks like any other card while in stock', () => {
    render(<ProductCard product={{ ...PRODUCT, salePrice: 100_000 }} />)
    expect(screen.queryByText('Sold out')).toBeNull()
    expect(screen.getByText(/% off/)).toBeTruthy()
    expect(quickAdd()).toBeTruthy()
  })
})
