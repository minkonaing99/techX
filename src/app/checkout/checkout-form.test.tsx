// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ADDRESS_ON_OPEN_ORDER_NOTE } from '@/lib/address-note'
import type { ApiResult } from '@/lib/api-client'
import type { CartLine } from '@/lib/cart-session'
import { CheckoutForm } from './checkout-form'

const { api, push, refresh, refreshCart, toast } = vi.hoisted(() => ({
  refresh: vi.fn(),
  api: vi.fn<(path: string, init?: RequestInit) => Promise<ApiResult<{ orderId: string }>>>(),
  push: vi.fn(),
  refreshCart: vi.fn(async () => {}),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}))

vi.mock('@/lib/api-client', () => ({ api }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/cart-store', () => ({
  useCart: (select: (s: Record<string, unknown>) => unknown) =>
    select({ items: [], hydrated: false, fetch: refreshCart, setQty: vi.fn(), remove: vi.fn() }),
}))

const LINE: CartLine = {
  productId: 'kestrel-75',
  qty: 1,
  product: {
    id: 'kestrel-75',
    slug: 'kestrel-75',
    name: 'Kestrel 75',
    tagline: '',
    priceMmk: 250_000,
    salePriceMmk: null,
    swatch: '#7A4F36',
    hasPhotos: false,
    stockQty: 4,
    isActive: true,
    category: 'keyboards',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
}

const ADDRESS = {
  id: 'addr-1',
  label: 'Home',
  recipient: 'Aung Aung',
  phone: '+959123456789',
  divisionId: 'ygn',
  city: 'Yangon',
  township: 'Sanchaung',
  street: '12 Baho Rd',
  landmark: null,
  telegramUsername: null,
  mapsUrl: null,
}

function renderAtReview() {
  render(
    <CheckoutForm
      addresses={[ADDRESS]}
      divisions={[{ id: 'ygn', name: 'Yangon', deliveryFeeMmk: 3_000, codAllowed: true }]}
      methods={[{ id: 'kbz', name: 'KBZPay', kind: 'wallet' }]}
      lines={[LINE]}
      subtotal={250_000}
      savings={0}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }))
  fireEvent.click(screen.getByRole('radio', { name: /KBZPay/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }))
  return screen.getByRole('button', { name: /Place order/ })
}

beforeEach(() => {
  vi.resetAllMocks()
  refreshCart.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('CheckoutForm on a phone', () => {
  function renderForm(addresses = [ADDRESS]) {
    render(
      <CheckoutForm
        addresses={addresses}
        divisions={[{ id: 'ygn', name: 'Yangon', deliveryFeeMmk: 3_000, codAllowed: true }]}
        methods={[{ id: 'kbz', name: 'KBZPay', kind: 'wallet' }]}
        lines={[LINE]}
        subtotal={250_000}
        savings={0}
      />,
    )
  }

  it('shows delivery and the total before the first Continue, not below it', () => {
    // The full summary sits after the steps, so on a phone it stacks below the button.
    renderForm()
    const total = screen.getByText('1 item - Delivery Ks 3,000 - Total Ks 253,000')
    const cont = screen.getByRole('button', { name: 'Continue to payment' })
    expect(total.compareDocumentPosition(cont) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Phones only: on desktop the summary column is beside the steps.
    expect(total.className.split(' ')).toContain('md:hidden')
  })

  it('shows it before Continue to review too', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }))
    const total = screen.getByText('1 item - Delivery Ks 3,000 - Total Ks 253,000')
    const cont = screen.getByRole('button', { name: 'Continue to review' })
    expect(total.compareDocumentPosition(cont) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says delivery comes once a division is chosen, before an address exists', () => {
    renderForm([])
    expect(screen.getByText('1 item - Delivery after you choose a division - Subtotal Ks 250,000')).toBeTruthy()
  })
})

describe('CheckoutForm placing the order', () => {
  it('sends one request for a double-click', async () => {
    // React flushes a click's state update before the next event, so `loading`
    // disables the button in time. The server refuses a duplicate anyway; this
    // keeps the client from sending one.
    api.mockReturnValue(new Promise(() => {}))
    const place = renderAtReview()

    fireEvent.click(place)
    fireEvent.click(place)

    expect(api).toHaveBeenCalledOnce()
  })

  it('sends the shopper to their orders when the cart was already ordered', async () => {
    // The other request of a double-submit won, so the order exists. Staying
    // here would leave a stale cart and a live button that can only fail.
    api.mockResolvedValue({
      ok: false,
      status: 409,
      data: null,
      error: { code: 'CART_ALREADY_ORDERED', message: 'This cart has already been ordered.' },
    })
    fireEvent.click(renderAtReview())

    await waitFor(() => expect(push).toHaveBeenCalledWith('/account/orders'))
    expect(refreshCart).toHaveBeenCalledOnce()
  })

  it('goes to the new order on success', async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: { orderId: 'o-1' }, error: null })
    fireEvent.click(renderAtReview())
    await waitFor(() => expect(push).toHaveBeenCalledWith('/order/o-1?placed=1'))
  })

  it('lets the shopper try again after an ordinary failure', async () => {
    api.mockResolvedValueOnce({
      ok: false,
      status: 500,
      data: null,
      error: { message: 'Order failed.' },
    })
    const place = renderAtReview()
    fireEvent.click(place)
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Order failed.'))

    api.mockReturnValue(new Promise(() => {}))
    fireEvent.click(place)
    expect(api).toHaveBeenCalledTimes(2)
  })
})

describe('CheckoutForm at the open-order cap', () => {
  it('says why and offers the way to the orders that are holding stock', async () => {
    api.mockResolvedValue({
      ok: false,
      status: 409,
      data: null,
      error: { code: 'TOO_MANY_OPEN_ORDERS', message: 'You already have 3 orders holding stock.' },
    })
    fireEvent.click(renderAtReview())

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    const [message, opts] = toast.error.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }]
    expect(message).toBe('You already have 3 orders holding stock.')
    expect(opts.action.label).toBe('My orders')
    opts.action.onClick()
    expect(push).toHaveBeenCalledWith('/account/orders')
  })
})

describe('CheckoutForm editing the saved address', () => {
  function renderAtDelivery() {
    render(
      <CheckoutForm
        addresses={[ADDRESS]}
        divisions={[{ id: 'ygn', name: 'Yangon', deliveryFeeMmk: 3_000, codAllowed: true }]}
        methods={[{ id: 'kbz', name: 'KBZ Pay', kind: 'wallet' }]}
        lines={[LINE]}
        subtotal={250_000}
        savings={0}
      />,
    )
  }

  it('opens the selected address prefilled, without the save-to-account box', () => {
    renderAtDelivery()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }))
    expect((screen.getByLabelText(/^Recipient/) as HTMLInputElement).value).toBe('Aung Aung')
    expect(screen.queryByText('Save this address to my account')).toBeNull()
  })

  it('will not continue while an edit is open', () => {
    renderAtDelivery()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }))
    expect(toast).toHaveBeenCalledWith('Save or cancel the address first.')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
  })

  it('saves the change to the address and refreshes checkout', async () => {
    api.mockResolvedValueOnce({ ok: true, status: 200, data: null, error: null } as never)
    renderAtDelivery()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }))
    fireEvent.change(screen.getByLabelText(/^Recipient/), { target: { value: 'Aung Min' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    const [path, init] = api.mock.calls.at(-1)!
    expect(path).toBe('/api/v1/addresses/addr-1')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toMatchObject({ recipient: 'Aung Min', phone: '+959123456789' })
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('says a placed order keeps its address when one was placed with the edited address', async () => {
    api.mockResolvedValueOnce({ ok: true, status: 200, data: { ok: true, onOpenOrder: true }, error: null } as never)
    renderAtDelivery()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(toast).toHaveBeenCalledWith(ADDRESS_ON_OPEN_ORDER_NOTE, { duration: 8000 })
  })

  it('says only that the address was updated otherwise', async () => {
    api.mockResolvedValueOnce({ ok: true, status: 200, data: { ok: true, onOpenOrder: false }, error: null } as never)
    renderAtDelivery()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(toast).toHaveBeenCalledWith('Address updated.')
  })

  it('closes the edit and re-reads checkout when the address is gone', async () => {
    api.mockResolvedValueOnce({
      ok: false,
      status: 404,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Address not found.', status: 404 },
    } as never)
    renderAtDelivery()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(toast.error).toHaveBeenCalledWith('Address not found.')
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('closes the edit when the buyer switches to a new address', () => {
    renderAtDelivery()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }))
    fireEvent.click(screen.getByRole('radio', { name: /Add new address/ }))
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('will not cancel or save twice while a save is in flight', async () => {
    let resolve: (v: unknown) => void = () => {}
    api.mockImplementationOnce(() => new Promise((r) => (resolve = r)) as never)
    renderAtDelivery()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Saving/ }))
    expect(api).toHaveBeenCalledTimes(1)
    resolve({ ok: true, status: 200, data: null, error: null })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})

describe('CheckoutForm with a monitor in the cart', () => {
  it('offers no cash on delivery and says why', () => {
    render(
      <CheckoutForm
        addresses={[ADDRESS]}
        divisions={[{ id: 'ygn', name: 'Yangon', deliveryFeeMmk: 3_000, codAllowed: true }]}
        methods={[
          { id: 'kbz', name: 'KBZ Pay', kind: 'wallet' },
          { id: 'cod', name: 'Cash on Delivery', kind: 'cod' },
        ]}
        lines={[{ ...LINE, product: { ...LINE.product, category: 'monitors' } }]}
        subtotal={250_000}
        savings={0}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }))
    expect(screen.queryByRole('radio', { name: /Cash on Delivery/ })).toBeNull()
    expect(screen.getByText('Cash on delivery is not offered for monitors.')).toBeTruthy()
  })
})
