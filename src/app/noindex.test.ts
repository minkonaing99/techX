import { describe, expect, it, vi } from 'vitest'
import type { Metadata } from 'next'

// The pages are imported for their `metadata` export only; nothing renders.
vi.mock('@/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: async () => null }))
vi.mock('@/lib/cart-session', () => ({ getCartLines: async () => [] }))
vi.mock('@/lib/catalog', () => ({ getAllProducts: async () => [] }))

const PAGES: Record<string, () => Promise<{ metadata: Metadata }>> = {
  cart: () => import('./cart/layout'),
  checkout: () => import('./checkout/page'),
  order: () => import('./order/[id]/page'),
  account: () => import('./account/layout'),
  search: () => import('./search/page'),
  signin: () => import('./signin/page'),
  signup: () => import('./signup/page'),
  verify: () => import('./verify/layout'),
}

/*
 * Pages that are personal, transactional or a query: nothing on them is worth a
 * search result, and an indexed cart or sign-in page crowds out the products.
 * `follow` stays on so links from them still count.
 */
describe('noindex pages', () => {
  for (const [name, load] of Object.entries(PAGES)) {
    it(`${name} asks search engines not to index it`, async () => {
      const { metadata } = await load()
      expect(metadata.robots).toEqual({ index: false, follow: true })
    })
  }
})
