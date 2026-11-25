import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from './middleware'

const SITE = 'https://techx-store.online'

function write(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${SITE}${path}`, { method: 'POST', headers })
}

beforeEach(() => {
  vi.stubEnv('AUTH_URL', SITE)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('middleware origin gate', () => {
  it('refuses a cookie-route write that carries no Origin', () => {
    expect(middleware(write('/api/v1/admin/products')).status).toBe(403)
  })

  it('refuses a cookie-route write from another site', () => {
    expect(middleware(write('/api/v1/admin/products', { origin: 'https://evil.example' })).status).toBe(403)
  })

  it('lets a bearer-token ops write through without an Origin', () => {
    // The route itself checks the token; the gate only guards cookie routes.
    expect(middleware(write('/api/v1/ops/products')).status).not.toBe(403)
  })

  it('lets an ops write through even from another origin - the token, not the origin, is the check', () => {
    expect(middleware(write('/api/v1/ops/products', { origin: 'https://evil.example' })).status).not.toBe(403)
  })

  it('still sets the content security policy on ops paths', () => {
    // Why the exemption lives in code rather than the matcher: excluding the
    // path there would drop this header too.
    expect(middleware(write('/api/v1/ops/products')).headers.get('Content-Security-Policy')).toBeTruthy()
  })

  it('still refuses a look-alike path', () => {
    expect(middleware(write('/api/v1/opsx')).status).toBe(403)
  })
})
