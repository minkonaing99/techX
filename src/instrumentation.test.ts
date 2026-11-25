import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let startFails = false
const { startOrderSweep, reportError } = vi.hoisted(() => ({
  startOrderSweep: vi.fn(),
  reportError: vi.fn<(err: unknown, ctx?: { path?: string }) => Promise<void>>(async () => {}),
}))

vi.mock('@/lib/order-sweep', () => ({
  startOrderSweep: () => {
    if (startFails) throw new Error('db url missing')
    startOrderSweep()
  },
}))
vi.mock('@/lib/report-error', () => ({ reportError }))

const { register } = await import('./instrumentation')

beforeEach(() => {
  startFails = false
  startOrderSweep.mockClear()
  reportError.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('register', () => {
  it('starts the order sweep on the production Node server', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('NODE_ENV', 'production')
    await register()
    expect(startOrderSweep).toHaveBeenCalledOnce()
  })

  it('leaves the sweep off in development', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('NODE_ENV', 'development')
    await register()
    expect(startOrderSweep).not.toHaveBeenCalled()
  })

  it('leaves the sweep off in the edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    vi.stubEnv('NODE_ENV', 'production')
    await register()
    expect(startOrderSweep).not.toHaveBeenCalled()
  })

  it('reports a failed start instead of stopping the server from booting', async () => {
    // Next rethrows anything register() throws, and the server never starts.
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('NODE_ENV', 'production')
    startFails = true
    await expect(register()).resolves.toBeUndefined()
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { path: 'register' })
  })
})
