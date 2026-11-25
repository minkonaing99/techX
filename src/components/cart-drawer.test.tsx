// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

const dismiss = vi.fn()
vi.mock('sonner', () => ({ toast: { dismiss: () => dismiss() } }))

const { useCart } = await import('@/lib/cart-store')
const { CartDrawer } = await import('./cart-drawer')

afterEach(() => {
  cleanup()
  dismiss.mockReset()
  act(() => useCart.setState({ isOpen: false, items: [] }))
})

describe('CartDrawer', () => {
  // The "Added" toast sat on top of the open drawer and hid the very line it confirmed.
  it('clears any toast when it opens', () => {
    render(<CartDrawer />)
    expect(dismiss).not.toHaveBeenCalled()
    act(() => useCart.setState({ isOpen: true }))
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  // Beside the quantity buttons on a phone, the was/now pair broke into "Ks" and a number.
  it('stacks a sale price on a phone', () => {
    act(() =>
      useCart.setState({
        isOpen: true,
        items: [
          {
            productId: 'vxe',
            qty: 1,
            product: {
              id: 'vxe',
              slug: 'vxe',
              name: 'VXE Dragonfly',
              tagline: '',
              priceMmk: 150_000,
              salePriceMmk: 100_000,
              swatch: '#fff',
              hasPhotos: false,
              stockQty: 5,
              isActive: true,
              category: 'mice',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        ] as never,
      }),
    )
    render(<CartDrawer />)
    expect(screen.getByLabelText('Was Ks 150,000, now Ks 100,000').className).toContain('flex-col')
  })

  // Between the quantity buttons and the price, "Only 1 available" squeezed the row.
  it('puts the stock note on its own line under the quantity on a phone', () => {
    act(() =>
      useCart.setState({
        isOpen: true,
        items: [
          {
            productId: 'mx',
            qty: 1,
            product: {
              id: 'mx',
              slug: 'mx',
              name: 'MX Master 4',
              tagline: '',
              priceMmk: 568_000,
              salePriceMmk: null,
              swatch: '#000',
              hasPhotos: false,
              stockQty: 1,
              isActive: true,
              category: 'mice',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        ] as never,
      }),
    )
    render(<CartDrawer />)
    const note = screen.getByText('Only 1 available')
    expect(note.className).toContain('basis-full')
    expect(note.className).toContain('sm:basis-auto')
  })
})
