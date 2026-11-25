// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ApiResult } from '@/lib/api-client'
import { formToPatch, rowToForm, type Row } from './product-form'
import { useProductRows } from './use-product-rows'

const { api, toast } = vi.hoisted(() => ({
  api: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ api }))
vi.mock('sonner', () => ({ toast }))

const ROW: Row = {
  id: 'p_1',
  name: 'Kestrel 75',
  slug: 'kestrel-75',
  categoryId: 'keyboards',
  priceMmk: 250000,
  salePriceMmk: null,
  tagline: 'A quiet board',
  description: 'Gasket mount.',
  swatch: '#7A4F36',
  stockQty: 4,
  lowStockThreshold: 3,
  sortOrder: 0,
  featured: false,
  isActive: true,
  hasPhotos: true,
  specs: [{ label: 'Layout', value: '75%' }],
  textVersion: 'a'.repeat(64),
}

const OTHER: Row = { ...ROW, id: 'p_2', slug: 'wren-65', name: 'Wren 65' }

function reply(status: number, error: ApiResult<unknown>['error'] = null): ApiResult<unknown> {
  return { ok: status < 400, status, data: null, error }
}

function setup() {
  return renderHook(() => useProductRows([ROW, OTHER]))
}

/** Opens the details panel, which is what seeds a draft for the row. */
function openDetails(result: ReturnType<typeof setup>['result']) {
  act(() => result.current.openSection(ROW.id, 'details'))
}

beforeEach(() => {
  // Reset, not clear: a test that fails early must not leave queued
  // `mockResolvedValueOnce` replies behind for the next one.
  vi.resetAllMocks()
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useProductRows createProduct', () => {
  it('answers false and calls nothing for an invalid form', async () => {
    const { result } = setup()
    let created: boolean | undefined
    await act(async () => {
      created = await result.current.createProduct()
    })
    expect(created).toBe(false)
    expect(api).not.toHaveBeenCalled()
  })

  it('answers true once the product is created, so the table can show it', async () => {
    api.mockResolvedValue({ ok: true, status: 201, data: { slug: 'wren-75', textVersion: 'c'.repeat(64) }, error: null })
    const { result } = setup()
    act(() =>
      result.current.setNewDraft({
        ...rowToForm(ROW),
        slug: 'wren-75',
        name: 'Wren 75',
      }),
    )
    let created: boolean | undefined
    await act(async () => {
      created = await result.current.createProduct()
    })
    expect(created).toBe(true)
    expect(result.current.rows[0]!.id).toBe('wren-75')
  })

  it('answers false when the server refuses', async () => {
    api.mockResolvedValue(reply(400, { code: 'BAD', message: 'Slug taken.' }))
    const { result } = setup()
    act(() => result.current.setNewDraft({ ...rowToForm(ROW), slug: 'wren-75' }))
    let created: boolean | undefined
    await act(async () => {
      created = await result.current.createProduct()
    })
    expect(created).toBe(false)
  })
})

describe('useProductRows saveRow', () => {
  it('does nothing for a row that was never opened', async () => {
    const { result } = setup()
    await act(() => result.current.saveRow(ROW.id))
    expect(api).not.toHaveBeenCalled()
  })

  it('refuses an invalid draft without calling the server', async () => {
    const { result } = setup()
    openDetails(result)
    act(() => result.current.updateDraft(ROW.id, { ...rowToForm(ROW), tagline: '' }))

    await act(() => result.current.saveRow(ROW.id))

    expect(api).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('Tagline is required.')
  })

  it('patches the trimmed form and shows the saved row as clean', async () => {
    api.mockResolvedValue(reply(200))
    const { result } = setup()
    openDetails(result)
    const edited = { ...rowToForm(ROW), name: '  Kestrel 75 Pro  ', stockQty: '9' }
    act(() => result.current.updateDraft(ROW.id, edited))

    await act(() => result.current.saveRow(ROW.id))

    expect(api).toHaveBeenCalledWith(`/api/v1/admin/products/${ROW.id}`, {
      method: 'PATCH',
      body: JSON.stringify(formToPatch(edited, ROW)),
    })
    const saved = result.current.rows[0]!
    expect(saved).toMatchObject({ name: 'Kestrel 75 Pro', stockQty: 9, hasPhotos: true })
    expect(result.current.rows[1]).toEqual(OTHER)
    expect(result.current.drafts[ROW.id]).toEqual(rowToForm(saved))
    expect(result.current.savingRow[ROW.id]).toBe(false)
    expect(toast).toHaveBeenCalledWith('Saved.')
  })

  it('takes the new text fingerprint from the server, so a second save works', async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: { ok: true, textVersion: 'b'.repeat(64) }, error: null })
    const { result } = setup()
    openDetails(result)
    act(() => result.current.updateDraft(ROW.id, { ...rowToForm(ROW), name: 'Kestrel 75 Pro' }))

    await act(() => result.current.saveRow(ROW.id))

    expect(result.current.rows[0]!.textVersion).toBe('b'.repeat(64))
  })

  it('keeps the row and the draft when the server refuses', async () => {
    api.mockResolvedValue(reply(400, { message: 'Slug taken.' }))
    const { result } = setup()
    openDetails(result)
    const edited = { ...rowToForm(ROW), name: 'Renamed' }
    act(() => result.current.updateDraft(ROW.id, edited))

    await act(() => result.current.saveRow(ROW.id))

    expect(result.current.rows[0]).toEqual(ROW)
    expect(result.current.drafts[ROW.id]).toEqual(edited)
    expect(result.current.savingRow[ROW.id]).toBe(false)
    expect(toast).toHaveBeenCalledWith('Slug taken.')
    expect(toast).not.toHaveBeenCalledWith('Saved.')
  })
})

describe('useProductRows deleteRow', () => {
  it('does nothing when the operator backs out', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const { result } = setup()

    await act(() => result.current.deleteRow(ROW.id))

    expect(api).not.toHaveBeenCalled()
    expect(result.current.rows).toHaveLength(2)
  })

  it('drops the row with its draft and panel state on success', async () => {
    api.mockResolvedValue(reply(200))
    const { result } = setup()
    openDetails(result)
    act(() => result.current.openSection(OTHER.id, 'details'))

    await act(() => result.current.deleteRow(ROW.id))

    expect(api).toHaveBeenCalledWith(`/api/v1/admin/products/${ROW.id}`, { method: 'DELETE' })
    expect(result.current.rows).toEqual([OTHER])
    expect(result.current.drafts).not.toHaveProperty(ROW.id)
    expect(result.current.expanded).not.toHaveProperty(ROW.id)
    expect(result.current.drafts[OTHER.id]).toEqual(rowToForm(OTHER))
    expect(result.current.expanded[OTHER.id]).toBe('details')
    expect(result.current.savingRow[ROW.id]).toBe(false)
    expect(toast).toHaveBeenCalledWith('Deleted.')
  })

  it('marks a product with order history inactive instead', async () => {
    api.mockResolvedValueOnce(reply(409, { code: 'CONFLICT' })).mockResolvedValueOnce(reply(200))
    const { result } = setup()
    openDetails(result)

    await act(() => result.current.deleteRow(ROW.id))

    expect(api.mock.calls).toEqual([
      [`/api/v1/admin/products/${ROW.id}`, { method: 'DELETE' }],
      [
        `/api/v1/admin/products/${ROW.id}`,
        { method: 'PATCH', body: JSON.stringify({ isActive: false }) },
      ],
    ])
    expect(result.current.rows[0]).toMatchObject({ id: ROW.id, isActive: false })
    expect(result.current.rows[1]).toEqual(OTHER)
    expect(result.current.drafts[ROW.id]?.isActive).toBe(false)
    expect(result.current.savingRow[ROW.id]).toBe(false)
    expect(toast).toHaveBeenCalledWith('Has order history - marked inactive instead.')
  })

  it('leaves the row active when the soft-delete fallback fails', async () => {
    api.mockResolvedValueOnce(reply(409, { code: 'CONFLICT' })).mockResolvedValueOnce(reply(500))
    const { result } = setup()

    await act(() => result.current.deleteRow(ROW.id))

    expect(result.current.rows[0]).toEqual(ROW)
    expect(result.current.savingRow[ROW.id]).toBe(false)
    expect(toast).toHaveBeenCalledWith('Could not mark inactive. Try again.')
  })

  it('keeps the row and says why on any other failure', async () => {
    api.mockResolvedValue(reply(500, { message: 'R2 unavailable.' }))
    const { result } = setup()

    await act(() => result.current.deleteRow(ROW.id))

    expect(api).toHaveBeenCalledOnce()
    expect(result.current.rows).toHaveLength(2)
    expect(result.current.savingRow[ROW.id]).toBe(false)
    expect(toast).toHaveBeenCalledWith('R2 unavailable.')
  })

  it('falls back to the status code when the failure has no message', async () => {
    api.mockResolvedValue(reply(502))
    const { result } = setup()

    await act(() => result.current.deleteRow(ROW.id))

    expect(toast).toHaveBeenCalledWith('Delete failed (502).')
  })
})

describe('useProductRows saveRow after a stock conflict', () => {
  it('adopts the stock as it now stands, so saving again goes through', async () => {
    // An order took stock while the page was open. The edit is kept; the
    // number it replaces becomes the current one.
    api.mockResolvedValueOnce(
      reply(409, { code: 'STOCK_CHANGED', message: 'Stock changed.', details: { stockQty: 2 } }),
    )
    const { result } = setup()
    openDetails(result)
    const edited = { ...rowToForm(ROW), stockQty: '9', name: 'Kestrel 75 Pro' }
    act(() => result.current.updateDraft(ROW.id, edited))

    await act(() => result.current.saveRow(ROW.id))

    expect(result.current.rows[0]?.stockQty).toBe(2)
    expect(result.current.drafts[ROW.id]).toEqual(edited)
    expect(toast).toHaveBeenCalledWith('Stock changed.')

    api.mockResolvedValueOnce(reply(200))
    await act(() => result.current.saveRow(ROW.id))
    const body = JSON.parse(String(api.mock.calls[1]?.[1]?.body)) as { stockQty: number; stockQtyWas: number }
    expect(body).toMatchObject({ stockQty: 9, stockQtyWas: 2 })
  })
})
