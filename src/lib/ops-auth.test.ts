import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from './auth-tokens'
import { resetBuckets } from './rate-limit'
import { requireOpsToken, resetOpsLogState } from './ops-auth'

const TOKEN = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef'
const HASH = hashToken(TOKEN)

let ip = 0
function req(headers: Record<string, string> = {}, from?: string): Request {
  ip += 1
  return new Request('https://techx-store.online/api/v1/ops/products', {
    headers: { 'x-forwarded-for': from ?? `10.20.0.${ip}`, ...headers },
  })
}

async function code(res: Response | null): Promise<string | null> {
  if (!res) return null
  return ((await res.json()) as { error: { code: string } }).error.code
}

beforeEach(() => {
  resetBuckets()
  vi.stubEnv('OPS_TOKEN_SHA256', HASH)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('requireOpsToken', () => {
  it('lets the right token through', () => {
    expect(requireOpsToken(req({ authorization: `Bearer ${TOKEN}` }))).toBeNull()
  })

  it('accepts the scheme in any case', () => {
    expect(requireOpsToken(req({ authorization: `bearer ${TOKEN}` }))).toBeNull()
  })

  it('accepts the token in either case: hex carries no meaning in its case', () => {
    expect(requireOpsToken(req({ authorization: `Bearer ${TOKEN.toUpperCase()}` }))).toBeNull()
  })

  it('reads the stored hash however it was pasted', () => {
    vi.stubEnv('OPS_TOKEN_SHA256', `  ${HASH.toUpperCase()}\n`)
    expect(requireOpsToken(req({ authorization: `Bearer ${TOKEN}` }))).toBeNull()
  })

  describe('while the feature is off', () => {
    // Off answers as if the routes did not exist: nothing to probe.
    it('answers 404 when no hash is configured', async () => {
      vi.stubEnv('OPS_TOKEN_SHA256', '')
      const res = requireOpsToken(req({ authorization: `Bearer ${TOKEN}` }))
      expect(res?.status).toBe(404)
      // Its own code, so the MCP can tell "switched off" from "no such product".
      expect(await code(res)).toBe('OPS_DISABLED')
    })

    it('answers 404, never opens, when the configured hash is malformed', () => {
      vi.stubEnv('OPS_TOKEN_SHA256', 'not-a-sha256')
      const res = requireOpsToken(req({ authorization: `Bearer ${TOKEN}` }))
      expect(res?.status).toBe(404)
    })
  })

  describe('refuses', () => {
    it.each([
      ['no header at all', {}],
      ['a session cookie with no token', { cookie: 'authjs.session-token=abc' }],
      ['another scheme', { authorization: `Basic ${TOKEN}` }],
      ['a token that is not 64 hex characters', { authorization: 'Bearer short' }],
      ['a token with trailing junk', { authorization: `Bearer ${TOKEN} extra` }],
      ['the hash itself instead of the token', { authorization: `Bearer ${HASH}` }],
      ['a wrong token', { authorization: `Bearer ${'b'.repeat(64)}` }],
    ])('%s with 401', async (_label, headers) => {
      const res = requireOpsToken(req(headers))
      expect(res?.status).toBe(401)
      expect(await code(res)).toBe('UNAUTHENTICATED')
    })
  })

  describe('rate limit', () => {
    it('counts failed attempts, so the token cannot be guessed by brute force', async () => {
      const from = '10.30.0.1'
      for (let i = 0; i < 60; i++) {
        expect(requireOpsToken(req({ authorization: `Bearer ${'c'.repeat(64)}` }, from))?.status).toBe(401)
      }
      const blocked = requireOpsToken(req({ authorization: `Bearer ${TOKEN}` }, from))
      expect(blocked?.status).toBe(429)
      expect(blocked?.headers.get('Retry-After')).toBeTruthy()
    })

    it('limits each caller separately', () => {
      for (let i = 0; i < 60; i++) requireOpsToken(req({}, '10.30.0.2'))
      expect(requireOpsToken(req({ authorization: `Bearer ${TOKEN}` }, '10.30.0.3'))).toBeNull()
    })
  })
})

describe('requireOpsToken logging', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetOpsLogState()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    vi.useRealTimers()
  })

  const logged = () => warn.mock.calls.map((c: unknown[]) => JSON.stringify(c)).join('\n')

  it('logs a refused token with the caller and path, never the token', () => {
    const wrong = 'c'.repeat(64)
    requireOpsToken(req({ authorization: `Bearer ${wrong}` }, '10.40.0.1'))
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toBe('[ops] refused token')
    expect(warn.mock.calls[0]?.[1]).toEqual({ ip: '10.40.0.1', path: '/api/v1/ops/products' })
    expect(logged()).not.toContain(wrong)
  })

  it('logs a malformed header the same way', () => {
    requireOpsToken(req({ authorization: 'Bearer short' }, '10.40.0.4'))
    expect(warn.mock.calls[0]?.[0]).toBe('[ops] refused token')
  })

  it('logs nothing while the feature is off', () => {
    vi.stubEnv('OPS_TOKEN_SHA256', '')
    requireOpsToken(req({}, '10.40.0.5'))
    expect(warn).not.toHaveBeenCalled()
  })

  it('logs a caller that is rate limited again in a later window', () => {
    vi.useFakeTimers()
    const from = '10.40.0.6'
    const flood = () => {
      for (let i = 0; i < 62; i++) requireOpsToken(req({ authorization: `Bearer ${TOKEN}` }, from))
    }
    flood()
    vi.advanceTimersByTime(61_000)
    flood()
    expect(warn.mock.calls.filter((c: unknown[]) => c[0] === '[ops] rate limited')).toHaveLength(2)
  })

  it('logs a missing token the same way', () => {
    requireOpsToken(req({}, '10.40.0.2'))
    expect(warn.mock.calls[0]?.[0]).toBe('[ops] refused token')
  })

  it('logs nothing for the right token', () => {
    requireOpsToken(req({ authorization: `Bearer ${TOKEN}` }))
    expect(warn).not.toHaveBeenCalled()
  })

  it('logs a rate-limited caller once per window, so a flood cannot flood the log', () => {
    const from = '10.40.0.3'
    for (let i = 0; i < 60; i++) requireOpsToken(req({ authorization: `Bearer ${TOKEN}` }, from))
    for (let i = 0; i < 25; i++) requireOpsToken(req({ authorization: `Bearer ${TOKEN}` }, from))
    const limited = warn.mock.calls.filter((c: unknown[]) => c[0] === '[ops] rate limited')
    expect(limited).toHaveLength(1)
    expect(limited[0]?.[1]).toMatchObject({ ip: from, path: '/api/v1/ops/products' })
  })
})
