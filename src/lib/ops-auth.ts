import { timingSafeEqual } from 'node:crypto'
import type { NextResponse } from 'next/server'
import { fail, rateLimited } from '@/lib/api-response'
import { hashToken } from '@/lib/auth-tokens'
import { clientIp, clientKey, rateLimit } from '@/lib/rate-limit'

/*
 * Gate for the ops API (`/api/v1/ops/*`), which the owner drives from their Mac
 * through a local MCP server (see docs/MCP-OPS.md).
 *
 * The token lives only in the Mac's Keychain; the server holds its SHA-256
 * (`OPS_TOKEN_SHA256`), so a leaked server environment does not leak the key.
 * No cookies are read here or in any ops route - that is what makes skipping
 * the middleware origin check safe (`isBearerApiPath`).
 */

const SHA256_HEX = /^[0-9a-f]{64}$/
/** `openssl rand -hex 32`: 64 lowercase hex characters. */
const BEARER = /^bearer ([0-9a-f]{64})$/i

/** Per caller, counting failed attempts, so the token cannot be guessed by brute force. */
const LIMIT = 60
const WINDOW_MS = 60_000

/** Callers already logged as rate limited, until their window ends. Bounded: expired entries go first, then all. */
const limitedLogged = new Map<string, number>()
const MAX_LIMITED_LOGGED = 1000

/*
 * Refusals are logged (never the token or its header) so a stolen or guessed
 * token leaves a trace in the host's logs, not only in Telegram.
 */
function logRefused(req: Request): void {
  console.warn('[ops] refused token', { ip: clientIp(req), path: new URL(req.url).pathname })
}

/** Once per caller per window: a flood of refused requests must not flood the log. */
function logLimited(req: Request, retryAfterSeconds: number): void {
  const ip = clientIp(req)
  const now = Date.now()
  if ((limitedLogged.get(ip) ?? 0) > now) return
  if (limitedLogged.size >= MAX_LIMITED_LOGGED) {
    for (const [key, until] of limitedLogged) if (until <= now) limitedLogged.delete(key)
    if (limitedLogged.size >= MAX_LIMITED_LOGGED) limitedLogged.clear()
  }
  limitedLogged.set(ip, now + retryAfterSeconds * 1000)
  console.warn('[ops] rate limited', { ip, path: new URL(req.url).pathname, retryAfterSeconds })
}

/** Test seam - the logged-callers map is module state. */
export function resetOpsLogState(): void {
  limitedLogged.clear()
}

function configuredHash(): string | null {
  const raw = process.env.OPS_TOKEN_SHA256?.trim().toLowerCase()
  if (!raw) return null
  if (!SHA256_HEX.test(raw)) {
    console.warn('[ops] OPS_TOKEN_SHA256 is not a 64-character hex SHA-256; the ops API stays off.')
    return null
  }
  return raw
}

/**
 * `null` when the request may proceed, otherwise the response to send.
 *
 * Off (no or malformed hash) answers 404, as if the routes did not exist; it
 * never fails open. The rate limit runs before the token check so failed
 * attempts count against it.
 */
export function requireOpsToken(req: Request): NextResponse | null {
  const expected = configuredHash()
  // Its own code, so the MCP can tell "switched off" from "no such product".
  if (!expected) return fail('OPS_DISABLED', 'Not found.', 404)

  const limit = rateLimit({ key: clientKey(req, 'ops'), limit: LIMIT, windowMs: WINDOW_MS })
  if (!limit.allowed) {
    logLimited(req, limit.retryAfterSeconds)
    return rateLimited('Too many requests.', limit.retryAfterSeconds)
  }

  const match = BEARER.exec(req.headers.get('authorization')?.trim() ?? '')
  const token = match?.[1]
  // One answer for missing, malformed and wrong, so the response says nothing
  // about how close a guess came.
  const ok = !!token && timingSafeEqual(Buffer.from(hashToken(token.toLowerCase()), 'hex'), Buffer.from(expected, 'hex'))
  if (!ok) {
    logRefused(req)
    return fail('UNAUTHENTICATED', 'Invalid or missing token.', 401)
  }

  return null
}

/** Ops answers carry live prices, stock and hidden products: no cache may keep them. */
export function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}
