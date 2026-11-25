import { describe, expect, it, vi } from 'vitest'
import type { Product } from '@/lib/types'

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'k2',
    slug: 'k2',
    name: 'Keychron K2 Pro',
    category: 'keyboards',
    price: 545_000,
    salePrice: null,
    tagline: '75% hot-swap with tri-mode wireless.',
    description: 'A compact wireless board.',
    specs: [],
    swatch: '#1C1B19',
    inStock: true,
    hasPhotos: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-10-23T08:00:00.000Z',
    ...over,
  }
}

const CATALOG: readonly Product[] = [
  product(),
  product({ id: 'bare', slug: 'bare', name: 'Bare', hasPhotos: false }),
  product({ id: 'gone', slug: 'gone', name: 'Gone', salePrice: 200_000, stockQty: 0, inStock: false }),
  product({ id: 'deal', slug: 'deal', name: 'Deal', salePrice: 200_000, stockQty: 3 }),
]

vi.mock('@/lib/catalog', () => ({
  getProductBySlug: async (slug: string) => CATALOG.find((p) => p.slug === slug),
  getProductsByCategory: async () => CATALOG,
  getRelatedProducts: async () => [],
  getCategoryById: async (id: string) => ({ id, name: 'Keyboards', description: '' }),
  getProductRatings: async () => ({}),
}))
const FACTS = { range: { min: 3_000, max: 8_500 }, uncovered: ['Kayah State'], wallet: true, cod: true, codMinFee: 3_000 }
let factsFail = false
vi.mock('@/lib/purchase-facts', () => ({
  getPurchaseFacts: async () => {
    if (factsFail) throw new Error('db down')
    return FACTS
  },
}))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const page = await import('./page')
const { PurchaseInfo } = await import('@/components/product/purchase-info')
const { generateMetadata } = page

/** Depth-first search of a rendered element tree for the first element whose type is `type`. */
function findElementOf(node: unknown, type: unknown): { props: Record<string, unknown> } | undefined {
  if (!node || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElementOf(child, type)
      if (hit) return hit
    }
    return undefined
  }
  const el = node as { type?: unknown; props?: { children?: unknown } }
  if (el.type === type) return el as { props: Record<string, unknown> }
  return findElementOf(el.props?.children, type)
}

/** Depth-first search of a rendered element tree for the first element of `type`. */
function findElement(node: unknown, type: string): { props: Record<string, unknown> } | undefined {
  if (!node || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, type)
      if (hit) return hit
    }
    return undefined
  }
  const el = node as { type?: unknown; props?: { children?: unknown } }
  if (el.type === type) return el as { props: Record<string, unknown> }
  return findElement(el.props?.children, type)
}

function meta(slug: string) {
  return generateMetadata({ params: Promise.resolve({ slug }) })
}

function ogImage(m: Awaited<ReturnType<typeof meta>>): string {
  return (m.openGraph?.images as { url: string }[])[0]!.url
}

describe('product page metadata', () => {
  it('shares as the product - its name, tagline and photo - not the site logo', async () => {
    const m = await meta('k2')
    expect(m.title).toBe('Keychron K2 Pro')
    expect(m.openGraph).toMatchObject({
      type: 'website',
      siteName: 'TechX',
      title: 'Keychron K2 Pro',
      description: '75% hot-swap with tri-mode wireless.',
      url: '/product/k2',
    })
    expect(ogImage(m)).toMatch(/\/k2\/01\.webp\?v=\d+$/)
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', title: 'Keychron K2 Pro' })
    expect((m.twitter?.images as string[])[0]).toBe(ogImage(m))
  })

  it('has a canonical URL, so shared links with ?fbclid= are not duplicates', async () => {
    expect((await meta('k2')).alternates).toEqual({ canonical: '/product/k2' })
  })

  it('falls back to the logo for a product without photos', async () => {
    const m = await meta('bare')
    expect(ogImage(m)).toBe('/logo.png')
    expect((m.twitter?.images as string[])[0]).toBe('/logo.png')
  })

  it('renders the Product JSON-LD on the page, escaped, on the same origin as the canonical', async () => {
    const tree = await page.default({ params: Promise.resolve({ slug: 'k2' }) })
    const script = findElement(tree, 'script')
    expect(script?.props.type).toBe('application/ld+json')
    const html = (script?.props.dangerouslySetInnerHTML as { __html: string }).__html
    expect(html).not.toContain('<')
    const ld = JSON.parse(html)
    expect(ld).toMatchObject({ '@type': 'Product', name: 'Keychron K2 Pro', sku: 'k2' })
    expect(ld.url).toBe(`${new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://techx-store.online').origin}/product/k2`)
    expect(ld).not.toHaveProperty('aggregateRating')
  })

  it('shows a sold-out product at its full price with no sale, as the cards do', async () => {
    const { Price } = await import('@/components/product/price')
    const { SaleBadge } = await import('@/components/product/sale-badge')
    const gone = await page.default({ params: Promise.resolve({ slug: 'gone' }) })
    const price = findElementOf(gone, Price)
    const badge = findElementOf(gone, SaleBadge)
    expect(price).toBeDefined()
    expect(badge).toBeDefined()
    expect(price?.props.salePriceMmk).toBeNull()
    expect(badge?.props.salePriceMmk).toBeNull()

    // In stock, the same product keeps its sale.
    const onSale = await page.default({ params: Promise.resolve({ slug: 'deal' }) })
    expect(findElementOf(onSale, Price)?.props.salePriceMmk).toBe(200_000)
  })

  it('keeps the not-found title for an unknown slug', async () => {
    expect((await meta('nope')).title).toBe('Not found')
  })
})

describe('product page purchase info', () => {
  it('sits with the buttons and is priced as the page shows it', async () => {
    const deal = await page.default({ params: Promise.resolve({ slug: 'deal' }) })
    expect(findElementOf(deal, PurchaseInfo)?.props).toMatchObject({ facts: FACTS, unitPrice: 200_000 })
    const gone = await page.default({ params: Promise.resolve({ slug: 'gone' }) })
    expect(findElementOf(gone, PurchaseInfo)?.props).toMatchObject({ unitPrice: 545_000 })
  })

  it('still renders the product without it when it cannot be read', async () => {
    factsFail = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const tree = await page.default({ params: Promise.resolve({ slug: 'k2' }) })
      expect(findElementOf(tree, PurchaseInfo)).toBeUndefined()
      expect(warn).toHaveBeenCalled()
    } finally {
      factsFail = false
      warn.mockRestore()
    }
  })
})
