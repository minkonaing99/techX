import { vi } from 'vitest'
import type { OpsProduct, ProductList } from './core.ts'
import type { StoredPlan } from './handlers.ts'
import { createPreviewStore } from './preview-store.ts'

/* Shared by the handler tests: a fake ops API and a small catalog. */

export const KESTREL: OpsProduct = {
  id: 'kestrel-75',
  slug: 'kestrel-75',
  name: 'Kestrel 75',
  categoryId: 'keyboards',
  priceMmk: 250_000,
  salePriceMmk: null,
  stockQty: 4,
  held: 0,
  isActive: true,
  hasPhotos: true,
}
export const LIST: ProductList = { products: [KESTREL], categories: [{ id: 'keyboards', name: 'Keyboards' }, { id: 'mice', name: 'Mice' }] }

export type Route = (body: unknown) => unknown
/** A fake ops API: answers by "METHOD path", records every call. */
export function fakeOps(routes: Record<string, Route>) {
  const calls: { key: string; body: unknown }[] = []
  const ops = vi.fn(async (path: string, options?: { method?: string; body?: unknown }) => {
    const key = `${options?.method ?? 'GET'} ${path}`
    calls.push({ key, body: options?.body })
    const route = routes[key]
    if (!route) throw new Error(`unexpected call ${key}`)
    return route(options?.body)
  })
  return { ops: ops as unknown as <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>, calls }
}

export function deps(routes: Record<string, Route>, now: () => number = Date.now) {
  const fake = fakeOps(routes)
  return { ...fake, previews: createPreviewStore<StoredPlan>(now) }
}

export const previewIdOf = (text: string) => /previewId: (\S+)/.exec(text)?.[1]
