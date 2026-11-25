// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { CartLine } from '@/lib/cart-store'

let items: CartLine[] = []
vi.mock('@/lib/cart-store', () => ({
  useCart: (select: (s: Record<string, unknown>) => unknown) =>
    select({ items, setQty: vi.fn(), remove: vi.fn() }),
  useCartSubtotal: () => items.reduce((sum, i) => sum + i.product.priceMmk * i.qty, 0),
}))

const { CartView } = await import('./cart-view')

afterEach(cleanup)

function line(over: Partial<CartLine['product']> = {}, qty = 1): CartLine {
  return {
    productId: 'arzopa',
    qty,
    product: {
      id: 'arzopa', slug: 'arzopa', name: 'ARZOPA Z1FC', tagline: '', priceMmk: 600_000,
      salePriceMmk: null, swatch: '#000', hasPhotos: false, stockQty: 4, isActive: true,
      category: 'monitors', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
    },
  }
}

describe('CartView summary', () => {
  it('calls the amount a subtotal and shows delivery as a range added at checkout', () => {
    items = [line()]
    render(<CartView delivery={{ min: 2_000, max: 5_000 }} />)
    // No "Total" here: delivery is not known until the address, at checkout.
    expect(screen.queryByText(/^Total$/)).toBeNull()
    expect(screen.getByText('Subtotal')).toBeTruthy()
    expect(screen.getByText('Ks 2,000 to Ks 5,000')).toBeTruthy()
    expect(screen.getByText(/by division, added at checkout before you pay/i)).toBeTruthy()
  })

  it('shows one fee when every division costs the same', () => {
    items = [line()]
    render(<CartView delivery={{ min: 3_000, max: 3_000 }} />)
    expect(screen.getByText('Ks 3,000')).toBeTruthy()
  })

  it('still says when delivery is added if the fees could not be read', () => {
    items = [line()]
    render(<CartView delivery={null} />)
    expect(screen.getByText(/added at checkout before you pay/i)).toBeTruthy()
    expect(screen.queryByText(/coordinated after confirmation/i)).toBeNull()
  })

  it('says it once when the cart holds more than is left - the line badge already does', () => {
    items = [line({ stockQty: 1 }, 3)]
    render(<CartView delivery={null} />)
    expect(screen.queryByText('Only 1 available')).toBeNull()
  })

  it('says why the + button stopped: only so many are in stock', () => {
    items = [line({ stockQty: 2 }, 2)]
    render(<CartView delivery={null} />)
    expect(screen.getByText('Only 2 available')).toBeTruthy()
  })
})
