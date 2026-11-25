import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBuckets } from '@/lib/rate-limit'

let dbFails = false
let dbHangs = false
/** Settles every hung query, so none holds an in-flight slot into the next test. */
const releases: (() => void)[] = []
let sweepCurrent = true

vi.mock('@/db', () => ({
  db: {
    execute: () => {
      if (dbHangs) return new Promise<void>((resolve) => releases.push(resolve))
      return dbFails ? Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:3306 user TechX')) : Promise.resolve([])
    },
  },
}))
vi.mock('@/lib/order-sweep', () => ({ sweepIsCurrent: () => sweepCurrent }))

const { GET } = await import('./route')

let ip = 0
function probe(): Request {
  ip += 1
  return new Request('http://localhost/api/v1/health', { headers: { 'x-forwarded-for': `10.7.0.${ip}` } })
}

beforeEach(() => {
  dbFails = false
  dbHangs = false
  sweepCurrent = true
  resetBuckets()
  vi.stubEnv('NODE_ENV', 'production')
})

afterEach(async () => {
  vi.useRealTimers()
  releases.splice(0).forEach((release) => release())
  await Promise.resolve()
})

describe('GET /api/v1/health', () => {
  it('answers 200 when the database answers and the sweep is running', async () => {
    const res = await GET(probe())
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ status: 'ok', db: 'ok', sweep: 'ok' })
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('answers 503 when the database is down, without the error text', async () => {
    dbFails = true
    const res = await GET(probe())
    expect(res.status).toBe(503)
    const body = JSON.stringify(await res.json())
    expect(body).toContain('"db":"down"')
    expect(body).not.toContain('ECONNREFUSED')
    expect(body).not.toContain('TechX')
  })

  it('answers 503 rather than hanging when the database does not answer', async () => {
    vi.useFakeTimers()
    dbHangs = true
    const pending = GET(probe())
    await vi.advanceTimersByTimeAsync(5000)
    expect((await pending).status).toBe(503)
  })

  it('answers down at once rather than queue a third probe behind a stalled database', async () => {
    dbHangs = true
    void GET(probe())
    void GET(probe())
    const res = await GET(probe())
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).toContain('"db":"down"')
  })

  it('keeps the rate-limited answer out of caches', async () => {
    const req = () => new Request('http://localhost/api/v1/health', { headers: { 'x-forwarded-for': '10.7.8.8' } })
    for (let i = 0; i < 30; i += 1) await GET(req())
    expect((await GET(req())).headers.get('cache-control')).toContain('no-store')
  })

  it('answers 503 in production when the sweep has stopped - held stock is not being released', async () => {
    sweepCurrent = false
    const res = await GET(probe())
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).toContain('"sweep":"stale"')
  })

  it('ignores the sweep outside production, where it never runs', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    sweepCurrent = false
    const res = await GET(probe())
    expect(res.status).toBe(200)
    expect((await res.json()).data.sweep).toBe('off')
  })

  it('rate limits a caller hammering it', async () => {
    const req = () => new Request('http://localhost/api/v1/health', { headers: { 'x-forwarded-for': '10.7.9.9' } })
    for (let i = 0; i < 30; i += 1) await GET(req())
    expect((await GET(req())).status).toBe(429)
  })
})
