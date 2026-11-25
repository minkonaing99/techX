import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * Keeps docs/ops-openapi.json in step with the ops routes: every route file
 * and every method it exports is described, nothing more, and every $ref
 * resolves. Deploy branches strip docs/, and CI runs there too, so the check
 * skips when docs/ is absent - but not when only the spec is missing.
 */

const ROOT = join(process.cwd(), 'src/app/api/v1/ops')
const SPEC_PATH = join(process.cwd(), 'docs/ops-openapi.json')
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

interface Operation {
  requestBody?: unknown
  responses?: Record<string, unknown>
}

interface Spec {
  openapi: string
  paths: Record<string, Record<string, Operation>>
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return routeFiles(p)
    return e.name === 'route.ts' ? [p] : []
  })
}

/** `src/app/api/v1/ops/products/[id]/stock/route.ts` -> `/api/v1/ops/products/{id}/stock`. */
function urlPath(file: string): string {
  const dir = relative(join(process.cwd(), 'src/app'), file).split(sep).slice(0, -1)
  return `/${dir.map((s) => s.replace(/^\[(.+)\]$/, '{$1}')).join('/')}`
}

/** Route handlers in any export form: `export (async) function GET`, `export const GET`, `export { GET }`. */
const EXPORT_RE =
  /^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|^export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b|^export\s*\{([^}]*)\}/gm

function exportedMethods(file: string): string[] {
  const code = readFileSync(file, 'utf8')
  const names = [...code.matchAll(EXPORT_RE)].flatMap((m) =>
    m[3] !== undefined ? (m[3].match(/\b(GET|POST|PUT|PATCH|DELETE)\b/g) ?? []) : [m[1] ?? m[2]!],
  )
  return [...new Set(names)].map((n) => n.toLowerCase()).sort()
}

function operations(spec: Spec): { name: string; op: Operation }[] {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => item[m]).map((m) => ({ name: `${m} ${path}`, op: item[m]! })),
  )
}

/** For each error narrowing that declares `details`: whether it also requires it. */
function detailsRequired(node: unknown): boolean[] {
  if (Array.isArray(node)) return node.flatMap(detailsRequired)
  if (!node || typeof node !== 'object') return []
  const n = node as { properties?: Record<string, unknown>; required?: string[] }
  const here = n.properties && 'details' in n.properties && 'code' in n.properties ? [!!n.required?.includes('details')] : []
  return [...here, ...Object.values(node).flatMap(detailsRequired)]
}

function refs(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(refs)
  if (!node || typeof node !== 'object') return []
  return Object.entries(node).flatMap(([k, v]) => (k === '$ref' && typeof v === 'string' ? [v] : refs(v)))
}

function resolves(spec: unknown, ref: string): boolean {
  if (!ref.startsWith('#/')) return false
  let node: unknown = spec
  for (const key of ref.slice(2).split('/')) {
    if (!node || typeof node !== 'object' || !(key in node)) return false
    node = (node as Record<string, unknown>)[key]
  }
  return node !== undefined
}

describe.skipIf(!existsSync(SPEC_PATH))('docs/ops-openapi.json', () => {
  const spec = JSON.parse(existsSync(SPEC_PATH) ? readFileSync(SPEC_PATH, 'utf8') : '{"paths":{}}') as Spec
  const routes = routeFiles(ROOT).map((f) => ({ path: urlPath(f), methods: exportedMethods(f) }))

  it('exists wherever docs/ does', () => {
    expect(existsSync(SPEC_PATH)).toBe(true)
  })

  it('finds at least one handler in every route file, so a missed export cannot pass as none', () => {
    for (const r of routes) expect(r.methods.length, r.path).toBeGreaterThan(0)
  })

  it('is OpenAPI 3.1', () => {
    expect(spec.openapi).toBe('3.1.0')
  })

  it('describes every ops route, and no route that does not exist', () => {
    expect(Object.keys(spec.paths).sort()).toEqual(routes.map((r) => r.path).sort())
  })

  it.each(routeFiles(ROOT).map((f) => [urlPath(f), exportedMethods(f)] as const))(
    '%s describes exactly the methods the route exports',
    (path, methods) => {
      const described = Object.keys(spec.paths[path] ?? {}).filter((k) => (METHODS as readonly string[]).includes(k))
      expect(described.sort()).toEqual(methods)
    },
  )

  it('gives every operation a success answer and the switched-off, token and rate-limit refusals', () => {
    for (const { name, op } of operations(spec)) {
      expect(Object.keys(op.responses ?? {}), name).toEqual(expect.arrayContaining(['200', '401', '404', '429']))
    }
  })

  it('gives every operation that takes a body its 400', () => {
    for (const { name, op } of operations(spec).filter((o) => o.op.requestBody)) {
      expect(Object.keys(op.responses ?? {}), name).toContain('400')
    }
  })

  it('describes the 413 wherever the route can answer it', () => {
    for (const file of routeFiles(ROOT).filter((f) => readFileSync(f, 'utf8').includes('PAYLOAD_TOO_LARGE'))) {
      const described = Object.values(spec.paths[urlPath(file)] ?? {}).some((op) => op.responses && '413' in op.responses)
      expect(described, urlPath(file)).toBe(true)
    }
  })

  it('requires details wherever an error declares them, since the routes always send them', () => {
    expect(detailsRequired(spec.paths).every(Boolean)).toBe(true)
  })

  it('resolves every $ref', () => {
    const broken = refs(spec).filter((r) => !resolves(spec, r))
    expect(broken).toEqual([])
  })
})
