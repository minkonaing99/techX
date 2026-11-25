import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from '@/lib/auth-tokens'
import { resetBuckets } from '@/lib/rate-limit'

const TOKEN = 'f'.repeat(64)
const WAS = 'a'.repeat(64)
const NEXT = 'b'.repeat(64)

const { revalidateTag, sendTelegram, readProductText, editProductText } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  sendTelegram: vi.fn<(text: string) => Promise<void>>(async () => {}),
  readProductText: vi.fn(),
  editProductText: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('@/lib/telegram', () => ({ sendTelegram }))
vi.mock('@/lib/product-edit', () => ({ readProductText, editProductText }))

const { GET, PATCH } = await import('./route')

const STORED = {
  id: 'kestrel-75',
  slug: 'kestrel-75',
  name: 'Kestrel 75',
  tagline: 'Gasket-mount 75%',
  description: 'Quiet.',
  specs: [{ label: 'Layout', value: '75%' }],
  isActive: true,
  hasPhotos: true,
  textVersion: WAS,
}

let ip = 0
function request(method: string, id: string, body?: unknown, token: string | null = TOKEN, headers: Record<string, string> = {}) {
  ip += 1
  return new Request(`https://techx-store.online/api/v1/ops/products/${id}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.71.0.${ip}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const get = (id: string, token?: string | null) => GET(request('GET', id, undefined, token), ctx(id))
const patch = (id: string, body: unknown, token?: string | null) => PATCH(request('PATCH', id, body, token), ctx(id))

async function json(res: Response) {
  return (await res.json()) as { data?: Record<string, unknown>; error?: { code: string; message: string } }
}

const EDIT = { dryRun: false, textWas: WAS, name: 'Kestrel 75 Pro' }

beforeEach(() => {
  resetBuckets()
  vi.stubEnv('OPS_TOKEN_SHA256', hashToken(TOKEN))
  readProductText.mockReset()
  readProductText.mockResolvedValue(STORED)
  editProductText.mockReset()
  editProductText.mockResolvedValue({ status: 'ok', changed: ['name'], textVersion: NEXT })
  revalidateTag.mockClear()
  sendTelegram.mockReset()
  sendTelegram.mockResolvedValue(undefined)
})

describe('GET /api/v1/ops/products/[id]', () => {
  it('checks the token before reading anything', async () => {
    const res = await get('kestrel-75', 'g'.repeat(64))
    expect(res.status).toBe(401)
    expect(readProductText).not.toHaveBeenCalled()
  })

  it('refuses an id of the wrong shape', async () => {
    expect((await get('Bad Id')).status).toBe(400)
  })

  it('answers 404 for an unknown product', async () => {
    readProductText.mockResolvedValue(null)
    expect((await get('nope')).status).toBe(404)
  })

  it('returns the text, its fingerprint and nothing else, never cached', async () => {
    readProductText.mockResolvedValue({ ...STORED, priceMmk: 1, secret: 'x' })
    const res = await get('kestrel-75')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect((await json(res)).data).toEqual(STORED)
  })
})

describe('PATCH /api/v1/ops/products/[id]', () => {
  it('checks the token before anything else', async () => {
    expect((await patch('kestrel-75', EDIT, null)).status).toBe(401)
    expect(editProductText).not.toHaveBeenCalled()
  })

  it('refuses an id of the wrong shape', async () => {
    expect((await patch('Bad Id', EDIT)).status).toBe(400)
  })

  it('refuses a body over 100 KB before reading it', async () => {
    const res = await PATCH(request('PATCH', 'kestrel-75', EDIT, TOKEN, { 'content-length': '100001' }), ctx('kestrel-75'))
    expect(res.status).toBe(413)
  })

  it.each([
    ['no text field', { dryRun: false, textWas: WAS }],
    ['a slug', { ...EDIT, slug: 'new-slug' }],
    ['an id', { ...EDIT, id: 'other' }],
    ['a category', { ...EDIT, categoryId: 'mice' }],
    ['a visibility flag', { ...EDIT, isActive: false }],
    ['no dryRun', { textWas: WAS, name: 'X' }],
    ['a textWas of the wrong shape', { ...EDIT, textWas: 'abc' }],
    ['a blank name', { ...EDIT, name: '   ' }],
    ['a two-line name', { ...EDIT, name: 'Kestrel\n75' }],
    ['a bidi override in the description', { ...EDIT, description: 'Quiet \u202Eswitch' }],
    ['41 specs', { ...EDIT, specs: Array(41).fill({ label: 'L', value: 'V' }) }],
    ['an 81-character spec label', { ...EDIT, specs: [{ label: 'x'.repeat(81), value: 'V' }] }],
  ])('refuses %s with 400', async (_, body) => {
    const res = await patch('kestrel-75', body)
    expect(res.status).toBe(400)
    expect(editProductText).not.toHaveBeenCalled()
  })

  it('hands the lib trimmed values and the fingerprint it was made from', async () => {
    await patch('kestrel-75', { dryRun: true, textWas: WAS, name: '  Kestrel 75 Pro ', specs: [{ label: ' Layout ', value: '75% ' }] })
    expect(editProductText).toHaveBeenCalledWith(
      'kestrel-75',
      WAS,
      { name: 'Kestrel 75 Pro', specs: [{ label: 'Layout', value: '75%' }] },
      true,
    )
  })

  it('answers 404 for an unknown product', async () => {
    editProductText.mockResolvedValue({ status: 'not_found' })
    expect((await patch('nope', EDIT)).status).toBe(404)
  })

  it('answers 409 STALE with no side effects when the text moved', async () => {
    editProductText.mockResolvedValue({ status: 'stale' })
    const res = await patch('kestrel-75', EDIT)
    expect(res.status).toBe(409)
    expect((await json(res)).error?.code).toBe('STALE')
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(sendTelegram).not.toHaveBeenCalled()
  })

  it('reports a dry run without side effects', async () => {
    const res = await patch('kestrel-75', { ...EDIT, dryRun: true })
    expect((await json(res)).data).toEqual({ applied: false, changed: ['name'], textVersion: NEXT })
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(sendTelegram).not.toHaveBeenCalled()
  })

  it('treats an apply that changes nothing as not applied, with no message', async () => {
    editProductText.mockResolvedValue({ status: 'ok', changed: [], textVersion: WAS })
    const res = await patch('kestrel-75', EDIT)
    expect((await json(res)).data).toEqual({ applied: false, changed: [], textVersion: WAS })
    expect(sendTelegram).not.toHaveBeenCalled()
  })

  it('applies, refreshes the catalog and tells the owner which fields, never the text', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    editProductText.mockResolvedValue({ status: 'ok', changed: ['name', 'specs'], textVersion: NEXT })
    const res = await patch('kestrel-75', { ...EDIT, specs: [] })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect((await json(res)).data).toEqual({ applied: true, changed: ['name', 'specs'], textVersion: NEXT })
    expect(revalidateTag).toHaveBeenCalledWith('products')
    expect(info).toHaveBeenCalledWith('[ops] product edited', expect.objectContaining({ id: 'kestrel-75', fields: ['name', 'specs'] }))
    const message = sendTelegram.mock.calls[0]![0]
    expect(message).toContain('kestrel-75')
    expect(message).toContain('name, specs')
    expect(message).not.toContain('Kestrel 75 Pro')
    info.mockRestore()
  })

  it('still answers 200 when Telegram fails', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    sendTelegram.mockRejectedValue(new Error('telegram down'))
    expect((await patch('kestrel-75', EDIT)).status).toBe(200)
  })
})
