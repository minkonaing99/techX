import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fail } from '@/lib/api-response'

let admin = true
/** The method row the route reads, or undefined for an unknown method. */
let storedRow: { qrImageUrl: string | null } | undefined
/** The row's id as MariaDB returns it; lookups match it case-insensitively. */
const ROW_ID = 'kbz_pay'
/** put, update and delete in the order the route made them. */
const events: string[] = []
let updateFails = false
let webpBytes = Buffer.from('qr-bytes')

const putPublic = vi.fn<(key: string, body: Buffer, type: string) => Promise<void>>(async () => {
  events.push('put')
})
const deletePublic = vi.fn<(key: string) => Promise<void>>(async () => {
  events.push('delete')
})
const updates: unknown[] = []

vi.mock('@/lib/admin-guard', () => ({
  requireAdmin: async () => (admin ? null : fail('FORBIDDEN', 'Admin only.', 403)),
}))

vi.mock('sharp', () => {
  const api: Record<string, unknown> = {
    rotate: () => api,
    resize: () => api,
    webp: () => api,
    toBuffer: async () => webpBytes,
  }
  return { default: () => api }
})

vi.mock('@/lib/r2', () => ({
  putPublic: (key: string, body: Buffer, type: string) => putPublic(key, body, type),
  deletePublic: (key: string) => deletePublic(key),
}))

vi.mock('@/lib/cdn', () => ({
  r2PublicUrl: (key: string | null) => (key ? `https://cdn.example/${key}` : null),
}))

vi.mock('@/db', () => {
  // Drizzle's builder is chainable and awaitable: every step returns the same thenable.
  function chain(result: () => unknown, onSet?: (patch: unknown) => void) {
    const c: Record<string, unknown> = {
      from: () => c,
      where: () => c,
      limit: () => c,
      set: (patch: unknown) => {
        onSet?.(patch)
        return c
      },
      then: (resolve: (v: unknown) => unknown) => resolve(result()),
    }
    return c
  }
  return {
    db: {
      select: () => chain(() => (storedRow ? [{ id: ROW_ID, ...storedRow }] : [])),
      update: () =>
        chain(
          () => {
            if (updateFails) throw new Error('db down')
            return [{ affectedRows: 1 }]
          },
          (patch) => {
            events.push('update')
            updates.push(patch)
          },
        ),
    },
  }
})

const { DELETE, POST } = await import('./route')

function keyFor(methodId: string, bytes: Buffer): string {
  return `payment-qr/${methodId}-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.webp`
}

function upload(methodId = 'kbz_pay'): Request {
  const form = new FormData()
  form.set('methodId', methodId)
  form.set('qr', new File([new Uint8Array(32)], 'qr.png', { type: 'image/png' }))
  return new Request('http://localhost/api/v1/admin/payment-methods/qr', { method: 'POST', body: form })
}

function remove(methodId = 'kbz_pay'): Request {
  return new Request(`http://localhost/api/v1/admin/payment-methods/qr?methodId=${methodId}`, {
    method: 'DELETE',
  })
}

beforeEach(() => {
  admin = true
  storedRow = { qrImageUrl: null }
  webpBytes = Buffer.from('qr-bytes')
  putPublic.mockClear()
  deletePublic.mockClear()
  updates.length = 0
  events.length = 0
  updateFails = false
})

describe('POST /api/v1/admin/payment-methods/qr', () => {
  it('names the object after its bytes, so a replaced QR gets a new URL', async () => {
    const res = await POST(upload())
    const key = keyFor('kbz_pay', webpBytes)

    expect(res.status).toBe(200)
    expect(putPublic).toHaveBeenCalledWith(key, webpBytes, 'image/webp')
    expect(updates).toEqual([{ qrImageUrl: key }])
    expect((await res.json()).data.qrImageUrl).toBe(`https://cdn.example/${key}`)
  })

  it('gives a different image a different key', async () => {
    await POST(upload())
    webpBytes = Buffer.from('another-qr')
    await POST(upload())

    const [first, second] = putPublic.mock.calls.map((c) => c[0])
    expect(first).not.toBe(second)
  })

  it('deletes the old QR after saving the new one, including the legacy fixed key', async () => {
    storedRow = { qrImageUrl: 'payment-qr/kbz_pay.webp' }
    await POST(upload())
    expect(deletePublic).toHaveBeenCalledWith('payment-qr/kbz_pay.webp')
    expect(events).toEqual(['put', 'update', 'delete'])
  })

  it('keeps the old QR when the row could not be pointed at the new one', async () => {
    storedRow = { qrImageUrl: 'payment-qr/kbz_pay.webp' }
    updateFails = true
    await expect(POST(upload())).rejects.toThrow('db down')
    expect(deletePublic).not.toHaveBeenCalled()
  })

  it('uses the row id, so a differently cased request still replaces the old QR', async () => {
    storedRow = { qrImageUrl: 'payment-qr/kbz_pay.webp' }
    await POST(upload('KBZ_PAY'))
    expect(putPublic.mock.calls[0]![0]).toBe(keyFor('kbz_pay', webpBytes))
    expect(deletePublic).toHaveBeenCalledWith('payment-qr/kbz_pay.webp')
  })

  it('reads a legacy disk path with its leading slash as the same key', async () => {
    storedRow = { qrImageUrl: '/payment-qr/kbz_pay.webp' }
    await POST(upload())
    expect(deletePublic).toHaveBeenCalledWith('payment-qr/kbz_pay.webp')
  })

  it('keeps the object when the same image is uploaded again', async () => {
    storedRow = { qrImageUrl: keyFor('kbz_pay', webpBytes) }
    await POST(upload())
    expect(deletePublic).not.toHaveBeenCalled()
  })

  it('never deletes an object that is not this method\'s QR', async () => {
    storedRow = { qrImageUrl: 'payment-qr/kbz_pay_2-0123456789abcdef.webp' }
    await POST(upload())
    storedRow = { qrImageUrl: 'payment-qr/kbz_pay_bank.webp' }
    await POST(upload())
    storedRow = { qrImageUrl: 'products/k2/01.webp' }
    await POST(upload())
    storedRow = { qrImageUrl: 'payment-qr/kbz_pay-/../products/k2/01.webp' }
    await POST(upload())
    storedRow = { qrImageUrl: 'payment-qr/kbz_pay-0123456789abcdef.webp/../../x' }
    await DELETE(remove())
    expect(deletePublic).not.toHaveBeenCalled()
  })

  it('still succeeds when deleting the old object fails', async () => {
    storedRow = { qrImageUrl: 'payment-qr/kbz_pay.webp' }
    deletePublic.mockRejectedValueOnce(new Error('R2 down'))
    const res = await POST(upload())
    expect(res.status).toBe(200)
  })

  it('stores nothing for an unknown method', async () => {
    storedRow = undefined
    const res = await POST(upload('nope'))
    expect(res.status).toBe(404)
    expect(putPublic).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('is admin only', async () => {
    admin = false
    const res = await POST(upload())
    expect(res.status).toBe(403)
    expect(putPublic).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/v1/admin/payment-methods/qr', () => {
  it('deletes the stored object, not a key it guesses', async () => {
    const key = keyFor('kbz_pay', webpBytes)
    storedRow = { qrImageUrl: key }
    const res = await DELETE(remove())
    expect(res.status).toBe(200)
    expect(deletePublic).toHaveBeenCalledWith(key)
    expect(updates).toEqual([{ qrImageUrl: null }])
  })

  it('clears the column even when the method has no QR', async () => {
    const res = await DELETE(remove())
    expect(res.status).toBe(200)
    expect(deletePublic).not.toHaveBeenCalled()
    expect(updates).toEqual([{ qrImageUrl: null }])
  })

  it('answers 404 for an unknown method, as POST does', async () => {
    storedRow = undefined
    const res = await DELETE(remove('nope'))
    expect(res.status).toBe(404)
    expect(updates).toEqual([])
  })
})
