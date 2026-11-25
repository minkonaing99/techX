import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBuckets } from '@/lib/rate-limit'

const PRODUCT_ID = 'k2-pro'
const updates: Record<string, unknown>[] = []

vi.mock('@/lib/admin-guard', () => ({ requireAdmin: async () => null }))
vi.mock('next/cache', () => ({ revalidateTag: () => {} }))

vi.mock('sharp', () => {
  const api: Record<string, unknown> = {
    rotate: () => api,
    clone: () => api,
    resize: () => api,
    webp: () => api,
    toBuffer: async () => Buffer.from('webp'),
  }
  return { default: () => api }
})

vi.mock('@/lib/r2', () => ({ putPublic: async () => {}, deletePublic: async () => {} }))
vi.mock('@/lib/cdn', () => ({ r2PublicUrl: (key: string) => `https://cdn.example/${key}` }))

vi.mock('@/db', () => {
  function chain(result: unknown, onSet?: (patch: Record<string, unknown>) => void) {
    const c: Record<string, unknown> = {
      from: () => c,
      where: () => c,
      limit: () => c,
      set: (patch: Record<string, unknown>) => {
        onSet?.(patch)
        return c
      },
      then: (resolve: (v: unknown) => unknown) => resolve(result),
    }
    return c
  }
  return {
    db: {
      select: () => chain([{ slug: 'keychron-k2-pro' }]),
      update: () => chain([{ affectedRows: 1 }], (patch) => updates.push(patch)),
    },
  }
})

const { DELETE, POST } = await import('./route')

function ctx(slot: string) {
  return { params: Promise.resolve({ id: PRODUCT_ID, slot }) }
}

function upload(): Request {
  const form = new FormData()
  form.set('photo', new File([new Uint8Array(32)], 'p.png', { type: 'image/png' }))
  return new Request('http://localhost/api/v1/admin/products/k2-pro/photos/02', {
    method: 'POST',
    headers: { 'x-forwarded-for': '10.9.0.1' },
    body: form,
  })
}

beforeEach(() => {
  updates.length = 0
  resetBuckets()
})

/*
 * Photo URLs carry `?v=<products.updated_at>` (see `productPhotoUrl`), because
 * a replaced photo keeps its key and R2 serves it as immutable for a year.
 * Every upload and removal must move that timestamp, whatever the slot.
 */
describe('product photo routes move updated_at, so photo URLs change', () => {
  it('on upload to any slot', async () => {
    const res = await POST(upload(), ctx('02'))
    expect(res.status).toBe(200)
    expect(updates).toHaveLength(1)
    expect(updates[0]!.updatedAt).toBeInstanceOf(Date)
    expect(updates[0]).not.toHaveProperty('hasPhotos')
  })

  it('on upload to slot 01, along with has_photos', async () => {
    await POST(upload(), ctx('01'))
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ hasPhotos: true })
    expect(updates[0]!.updatedAt).toBeInstanceOf(Date)
  })

  it('on removal', async () => {
    const req = new Request('http://localhost/x', { method: 'DELETE' })
    await DELETE(req, ctx('03'))
    expect(updates).toHaveLength(1)
    expect(updates[0]!.updatedAt).toBeInstanceOf(Date)

    updates.length = 0
    await DELETE(req, ctx('01'))
    expect(updates[0]).toMatchObject({ hasPhotos: false })
    expect(updates[0]!.updatedAt).toBeInstanceOf(Date)
  })
})
