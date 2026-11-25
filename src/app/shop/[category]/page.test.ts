import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/catalog', () => ({
  getCategoryById: async (id: string) => (id === 'mice' ? { id, name: 'Mice', description: 'Mice.' } : undefined),
  getProductsByCategory: async () => [],
  getAllProducts: async () => [],
  getAllCategories: async () => [],
}))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const { generateMetadata } = await import('./page')
const shop = await import('../page')

describe('shop canonicals', () => {
  it('gives a category page its canonical URL', async () => {
    const m = await generateMetadata({ params: Promise.resolve({ category: 'mice' }) })
    expect(m.alternates).toEqual({ canonical: '/shop/mice' })
  })

  it('gives the shop page its canonical URL', () => {
    expect(shop.metadata.alternates).toEqual({ canonical: '/shop' })
  })
})
