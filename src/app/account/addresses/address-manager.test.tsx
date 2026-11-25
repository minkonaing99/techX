// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ADDRESS_ON_OPEN_ORDER_NOTE } from '@/lib/address-note'
import { AddressManager } from './address-manager'

const { api, refresh, toast } = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const HOME = {
  id: '3aa6e85b-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  label: 'Home',
  recipient: 'Tommy',
  phone: '9123456789',
  divisionId: 'yangon',
  city: 'Yangon',
  township: 'Bahan',
  street: 'No 23',
  landmark: '',
  telegramUsername: '',
  mapsUrl: '',
  isDefault: true,
}

function saveEdit() {
  render(<AddressManager initial={[HOME]} divisions={[{ id: 'yangon', name: 'Yangon Region' }]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
}

beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

describe('AddressManager edit', () => {
  it('says a placed order keeps its address when one was placed with it', async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: { ok: true, onOpenOrder: true }, error: null })
    saveEdit()
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(toast).toHaveBeenCalledWith(ADDRESS_ON_OPEN_ORDER_NOTE, { duration: 8000 })
  })

  it('says only that the address was updated otherwise', async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: { ok: true, onOpenOrder: false }, error: null })
    saveEdit()
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(toast).toHaveBeenCalledWith('Address updated.')
  })
})
