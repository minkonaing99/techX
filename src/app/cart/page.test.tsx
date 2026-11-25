import { afterEach, describe, expect, it, vi } from 'vitest'

let fees: () => Promise<{ deliveryFeeMmk: number }[]> = async () => []
vi.mock('@/lib/delivery-fees', () => ({ getDeliveryFees: () => fees() }))
vi.mock('./cart-view', () => ({ CartView: () => null }))

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
const { default: CartPage } = await import('./page')

afterEach(() => warn.mockClear())

describe('cart page', () => {
  it('hands the cart the delivery range', async () => {
    fees = async () => [{ deliveryFeeMmk: 3_000 }, { deliveryFeeMmk: 8_500 }]
    const el = (await CartPage()) as { props: { delivery: unknown } }
    expect(el.props.delivery).toEqual({ min: 3_000, max: 8_500 })
  })

  it('still renders the cart when the fees cannot be read, and says why in the log', async () => {
    fees = async () => {
      throw new Error('connect ECONNREFUSED')
    }
    const el = (await CartPage()) as { props: { delivery: unknown } }
    expect(el.props.delivery).toBeNull()
    expect(warn).toHaveBeenCalledWith('[cart] delivery fees unreadable', 'connect ECONNREFUSED')
  })
})
