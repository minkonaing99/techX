import { beforeEach, describe, expect, it, vi } from 'vitest'

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const { ADDRESS_ON_OPEN_ORDER_NOTE, toastAddressSaved } = await import('./address-note')

beforeEach(() => toast.mockReset())

describe('toastAddressSaved', () => {
  it('adds the placed-order note, shown longer, when an open order used the address', () => {
    toastAddressSaved(true)
    expect(toast).toHaveBeenCalledWith(ADDRESS_ON_OPEN_ORDER_NOTE, { duration: 8000 })
    expect(ADDRESS_ON_OPEN_ORDER_NOTE).toBe(
      'Address updated. An order you already placed still goes to the address it was placed with. Message us if that order needs to change.',
    )
  })

  it('says only that the address was updated otherwise', () => {
    toastAddressSaved(false)
    expect(toast).toHaveBeenCalledWith('Address updated.')
  })
})
