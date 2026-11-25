import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fail } from '@/lib/api-response'
import { resetBuckets } from '@/lib/rate-limit'
import { mp4, type Mp4Spec } from '@/test/mp4-fixture'

/*
 * Video uploads through the real MP4 parser. Same module mocks as
 * route.test.ts; split out to keep that file a readable size.
 */

let admin = true
let storedKey: string | null = null
const sharpCalls = vi.fn()

const revalidateTag = vi.fn()
const setSetting = vi.fn<(key: string, value: string) => Promise<void>>(async () => {})
const putPublic = vi.fn<(key: string, body: Buffer, type: string) => Promise<void>>(async () => {})
const deletePublic = vi.fn<(key: string) => Promise<void>>(async () => {})

vi.mock('@/lib/admin-guard', () => ({
  requireAdmin: async () => (admin ? null : fail('FORBIDDEN', 'Admin only.', 403)),
}))
vi.mock('next/cache', () => ({ revalidateTag: (t: string) => revalidateTag(t) }))
vi.mock('sharp', () => {
  const api: Record<string, unknown> = {
    rotate: () => api,
    resize: () => api,
    webp: () => api,
    toBuffer: async () => Buffer.from('webp-bytes'),
  }
  return {
    default: () => {
      sharpCalls()
      return api
    },
  }
})
vi.mock('@/lib/r2', () => ({
  putPublic: (key: string, body: Buffer, type: string) => putPublic(key, body, type),
  deletePublic: (key: string) => deletePublic(key),
}))
vi.mock('@/lib/cdn', () => ({
  r2PublicUrl: (key: string | null) => (key ? `https://cdn.example/${key}` : null),
}))
vi.mock('@/lib/site-settings', () => ({
  getSetting: async () => storedKey,
  setSetting: (key: string, value: string) => setSetting(key, value),
  deleteSetting: async () => {},
}))

const { POST } = await import('./route')

const keyFor = (bytes: Uint8Array) => `site/why-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.mp4`

function video(spec: Mp4Spec = {}, type = 'video/mp4'): { file: File; bytes: Uint8Array } {
  const bytes = mp4(spec)
  return { file: new File([bytes], 'why.mp4', { type }), bytes }
}

let ip = 0
function upload(file: File): Request {
  ip += 1
  const form = new FormData()
  form.set('image', file)
  return new Request('http://localhost/api/v1/admin/site/why-image', {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.6.0.${ip}` },
    body: form,
  })
}

async function answer(res: Response) {
  return (await res.json()) as { data?: { url: string; kind: string; faststart?: boolean }; error?: { message: string } }
}

beforeEach(() => {
  admin = true
  storedKey = null
  ;[sharpCalls, revalidateTag, setSetting, putPublic, deletePublic].forEach((m) => m.mockClear())
  putPublic.mockImplementation(async () => {})
  setSetting.mockImplementation(async () => {})
  resetBuckets()
})

describe('POST why-image with a video', () => {
  it('stores a square H.264 clip of 20 s byte for byte, under a key named after its bytes', async () => {
    const { file, bytes } = video({ duration: 20_000 })
    const res = await POST(upload(file))
    expect(res.status).toBe(200)
    expect(await answer(res)).toEqual({
      data: { url: `https://cdn.example/${keyFor(bytes)}`, kind: 'video', faststart: true },
      error: null,
    })
    const [key, body, type] = putPublic.mock.calls[0]!
    expect(key).toBe(keyFor(bytes))
    expect(new Uint8Array(body)).toEqual(bytes)
    expect(type).toBe('video/mp4')
    expect(setSetting).toHaveBeenCalledWith('why_image', keyFor(bytes))
    expect(revalidateTag).toHaveBeenCalledWith('site-settings')
    expect(sharpCalls).not.toHaveBeenCalled()
  })

  it('accepts a clip just inside the limits', async () => {
    expect((await POST(upload(video({ duration: 20_050 }).file))).status).toBe(200)
    expect((await POST(upload(video({ width: 1080, height: 1081 }).file))).status).toBe(200)
  })

  it('accepts moov at the end, but says it will start slower', async () => {
    const res = await POST(upload(video({ moovAtEnd: true }).file))
    expect(res.status).toBe(200)
    expect((await answer(res)).data?.faststart).toBe(false)
  })

  it('refuses a video over 6 MB before reading it', async () => {
    const res = await POST(upload(video({ mdatBytes: 6 * 1024 * 1024 }).file))
    expect(res.status).toBe(413)
    expect((await answer(res)).error?.message).toBe('Video over 6 MB.')
    expect(putPublic).not.toHaveBeenCalled()
  })

  it.each(['video/quicktime', 'video/webm'])('refuses %s', async (type) => {
    expect((await POST(upload(video({}, type).file))).status).toBe(415)
    expect(putPublic).not.toHaveBeenCalled()
  })

  it('refuses bytes that only claim to be an MP4', async () => {
    const res = await POST(upload(new File([new Uint8Array(64)], 'why.mp4', { type: 'video/mp4' })))
    expect(res.status).toBe(400)
    expect(putPublic).not.toHaveBeenCalled()
  })

  it.each<[string, Mp4Spec, number, string]>([
    ['HEVC', { codec: 'hvc1' }, 415, 'Video must be H.264 MP4.'],
    ['20.2 s', { duration: 20_200 }, 400, 'Video longer than 20 seconds.'],
    ['portrait', { width: 1080, height: 1920 }, 400, 'Video must be square (1:1).'],
  ])('refuses a %s clip', async (_label, spec, status, message) => {
    const res = await POST(upload(video(spec).file))
    expect(res.status).toBe(status)
    expect((await answer(res)).error?.message).toBe(message)
    expect(putPublic).not.toHaveBeenCalled()
  })

  it.each<[string, Mp4Spec]>([
    ['fragmented', { fragmented: true }],
    ['zero-length', { duration: 0 }],
  ])('refuses a %s file', async (_label, spec) => {
    expect((await POST(upload(video(spec).file))).status).toBe(400)
    expect(putPublic).not.toHaveBeenCalled()
  })

  it('replaces a stored photo, and a photo replaces a stored video', async () => {
    storedKey = 'site/why-0123456789abcdef.webp'
    await POST(upload(video().file))
    expect(deletePublic).toHaveBeenCalledWith('site/why-0123456789abcdef.webp')

    deletePublic.mockClear()
    storedKey = 'site/why-0123456789abcdef.mp4'
    await POST(upload(new File([new Uint8Array(32)], 'why.png', { type: 'image/png' })))
    expect(deletePublic).toHaveBeenCalledWith('site/why-0123456789abcdef.mp4')
  })

  it('does not delete its own object when the same video is uploaded again', async () => {
    const { file, bytes } = video()
    storedKey = keyFor(bytes)
    await POST(upload(file))
    expect(deletePublic).not.toHaveBeenCalled()
  })

  it('leaves the setting alone when the bucket write fails', async () => {
    putPublic.mockRejectedValueOnce(new Error('R2 down'))
    expect((await POST(upload(video().file))).status).toBe(502)
    expect(setSetting).not.toHaveBeenCalled()
    expect(deletePublic).not.toHaveBeenCalled()
  })

  it('refuses a non-admin before reading anything', async () => {
    admin = false
    expect((await POST(upload(video().file))).status).toBe(403)
    expect(putPublic).not.toHaveBeenCalled()
  })
})
