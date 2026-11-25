import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { fail, ok, rateLimited } from '@/lib/api-response'
import { sweepIsCurrent } from '@/lib/order-sweep'
import { clientKey, rateLimit } from '@/lib/rate-limit'

/*
 * For an outside uptime monitor (docs/DEPLOY.md, "Uptime monitor"). A server
 * that is down cannot alert anyone, so something else has to ask. 200 when the
 * database answers and, in production, the unpaid-order sweep is running; 503
 * otherwise. The body names which check failed and nothing more: no versions,
 * hosts or error text.
 */

export const dynamic = 'force-dynamic'

const DB_TIMEOUT_MS = 3000
/**
 * The timeout stops waiting but cannot cancel the query, which keeps its pool
 * connection until MariaDB answers. During a stall, more probes would drain the
 * pool checkout shares, so a third concurrent probe is answered 'down' at once.
 */
const MAX_IN_FLIGHT = 2
let inFlight = 0

async function databaseAnswers(): Promise<boolean> {
  if (inFlight >= MAX_IN_FLIGHT) return false
  inFlight += 1
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), DB_TIMEOUT_MS)
  })
  const query = db
    .execute(sql`select 1`)
    .then(
      () => true,
      () => false,
    )
    .finally(() => {
      inFlight -= 1
    })
  try {
    return await Promise.race([query, timeout])
  } finally {
    clearTimeout(timer)
  }
}

function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function GET(req: Request): Promise<NextResponse> {
  // Every probe is a database round trip; a monitor needs one a minute at most.
  const limit = rateLimit({ key: clientKey(req, 'health'), limit: 30, windowMs: 60 * 1000 })
  if (!limit.allowed) return noStore(rateLimited('Too many requests.', limit.retryAfterSeconds))

  const database = (await databaseAnswers()) ? 'ok' : 'down'
  // The sweep only runs in production (src/instrumentation.ts).
  const sweep = process.env.NODE_ENV !== 'production' ? 'off' : sweepIsCurrent() ? 'ok' : 'stale'
  const checks = { db: database, sweep }

  if (database === 'down' || sweep === 'stale') {
    return noStore(fail('UNHEALTHY', 'A health check failed.', 503, checks))
  }
  return noStore(ok({ status: 'ok', ...checks }))
}
