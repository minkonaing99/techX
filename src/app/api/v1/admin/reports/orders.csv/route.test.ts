import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fail } from '@/lib/api-response'
import { resetBuckets } from '@/lib/rate-limit'
import type { ExportOrder } from '@/lib/admin-sales'

let guard: 'admin' | 'signed-out' | 'customer' = 'admin'
let exported: ExportOrder[] = []
const getOrdersForExport = vi.fn<(start: Date, end: Date) => Promise<ExportOrder[]>>(async () => exported)

const audit = vi.spyOn(console, 'info').mockImplementation(() => {})

vi.mock('@/lib/admin-guard', () => ({
  currentRole: async () => ({ userId: 'admin-1', role: 'admin' }),
  requireAdmin: async () =>
    guard === 'admin'
      ? null
      : guard === 'signed-out'
        ? fail('UNAUTHENTICATED', 'Sign in required.', 401)
        : fail('FORBIDDEN', 'Admin only.', 403),
}))
vi.mock('@/lib/admin-sales', () => ({
  getOrdersForExport: (s: Date, e: Date) => getOrdersForExport(s, e),
}))

const { GET } = await import('./route')

let ip = 0
function request(query: string, from?: string): Request {
  ip += 1
  return new Request(`http://localhost/api/v1/admin/reports/orders.csv?${query}`, {
    headers: { 'x-forwarded-for': from ?? `10.8.0.${ip}` },
  })
}

const ORDER: ExportOrder = {
  id: '3aa6e85b-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  placedAt: new Date('2026-10-22T17:45:00Z'),
  status: 'confirmed',
  paymentMethodId: 'kbz_pay',
  paymentKind: 'wallet',
  subtotalMmk: 545_000,
  deliveryFeeMmk: 3_000,
  totalMmk: 548_000,
  customerName: '=HYPERLINK("http://evil.example","click")',
  customerEmail: 'buyer@example.com',
  shipRecipient: 'Mg Mg',
  shipPhone: '+959123456789',
  shipDivisionName: 'Yangon',
  shipTownship: 'Kamayut',
  paymentTxRef: null,
  items: '1x Keychron K2 Pro',
}

beforeEach(() => {
  guard = 'admin'
  exported = [ORDER]
  getOrdersForExport.mockClear()
  resetBuckets()
})

describe('GET /api/v1/admin/reports/orders.csv', () => {
  it('is for admins only, and reads nothing for anyone else', async () => {
    guard = 'signed-out'
    expect((await GET(request('from=2026-10-01&to=2026-10-23'))).status).toBe(401)
    guard = 'customer'
    expect((await GET(request('from=2026-10-01&to=2026-10-23'))).status).toBe(403)
    expect(getOrdersForExport).not.toHaveBeenCalled()
  })

  it('refuses bad, reversed and over-long ranges', async () => {
    for (const q of ['from=2026-10-01', 'from=2026-13-01&to=2026-10-23', 'from=2026-10-23&to=2026-10-01', 'from=2024-01-01&to=2026-10-23']) {
      const res = await GET(request(q))
      expect(res.status).toBe(400)
    }
    expect(getOrdersForExport).not.toHaveBeenCalled()
  })

  it('downloads the range as CSV, Myanmar dates inclusive, never cached', async () => {
    const res = await GET(request('from=2026-10-01&to=2026-10-23'))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith('[admin] orders exported', 'admin-1', '2026-10-01', '2026-10-23', 1)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="orders-2026-10-01-to-2026-10-23.csv"')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(getOrdersForExport).toHaveBeenCalledWith(new Date('2026-09-30T17:30:00Z'), new Date('2026-10-23T17:30:00Z'))

    const [header, row] = (await res.text()).replace(/^\uFEFF/, '').split('\r\n')
    expect(header).toBe(
      'order_id,placed_at_mm,status,payment_method,payment_kind,subtotal_mmk,delivery_fee_mmk,total_mmk,customer_name,customer_email,ship_recipient,ship_phone,ship_division,ship_township,payment_tx_ref,items',
    )
    expect(row).toContain('3aa6e85b-1c2d-4e5f-8a9b-0c1d2e3f4a5b,2026-10-23 00:15,confirmed,kbz_pay,wallet,545000,3000,548000,')
    // Customer-typed text cannot run as a formula when the owner opens the file.
    expect(row).toContain('"\'=HYPERLINK(""http://evil.example"",""click"")"')
    expect(row).toContain("'+959123456789")
  })

  it('gives just the header for a range with no orders', async () => {
    exported = []
    const text = (await (await GET(request('from=2026-10-01&to=2026-10-23'))).text()).replace(/^\uFEFF/, '')
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(1)
  })

  it('rate limits a caller before checking who they are', async () => {
    for (let i = 0; i < 20; i += 1) await GET(request('from=2026-10-01&to=2026-10-23', '10.8.9.9'))
    expect((await GET(request('from=2026-10-01&to=2026-10-23', '10.8.9.9'))).status).toBe(429)
  })
})
