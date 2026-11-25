import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * The middleware skips its origin (CSRF) check for /api/v1/ops because these
 * routes authenticate with a bearer token and read no cookies. A route here
 * that touched the session would be cookie-authenticated with no CSRF guard.
 * This keeps the rule from resting on memory. It sees direct imports only.
 */

const ROOT = join(process.cwd(), 'src/app/api/v1/ops')
const FORBIDDEN = [/from ['"]next\/headers['"]/, /from ['"]@\/lib\/auth['"]/, /\bcookies\(/, /\bauth\(/]

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

describe('ops routes', () => {
  it('exist to be checked', () => {
    expect(sources(ROOT).length).toBeGreaterThan(0)
  })

  it.each(sources(ROOT))('%s reads no cookies and no session', (file) => {
    const code = readFileSync(file, 'utf8')
    for (const pattern of FORBIDDEN) expect(code).not.toMatch(pattern)
  })
})
