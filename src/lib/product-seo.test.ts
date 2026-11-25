import { describe, expect, it } from 'vitest'
import { jsonLdScript, productImageUrl, productJsonLd } from './product-seo'
import { productPhotoUrl, type Product } from './types'

const ORIGIN = 'https://shop.example'

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
    specs: [{ label: 'Layout', value: '75%' }],
    swatch: '#1C1B19',
    inStock: true,
    stockQty: 4,
    hasPhotos: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-10-23T08:00:00.000Z',
    ...over,
  }
}

describe('productImageUrl', () => {
  it('is the hero photo when there is one', () => {
    expect(productImageUrl(product())).toBe(productPhotoUrl('k2', '01.webp', '2026-10-23T08:00:00.000Z'))
  })

  it('falls back to the logo without photos', () => {
    expect(productImageUrl(product({ hasPhotos: false }))).toBe('/logo.png')
  })
})

describe('productJsonLd', () => {
  it('describes the product and its offer in MMK', () => {
    const ld = productJsonLd(product(), undefined, ORIGIN)
    expect(ld).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Keychron K2 Pro',
      description: 'A compact wireless board.',
      sku: 'k2',
      url: 'https://shop.example/product/k2',
      offers: {
        '@type': 'Offer',
        price: 545_000,
        priceCurrency: 'MMK',
        availability: 'https://schema.org/InStock',
        url: 'https://shop.example/product/k2',
      },
    })
  })

  it('offers the sale price, but only a real one', () => {
    expect(productJsonLd(product({ salePrice: 499_000 }), undefined, ORIGIN).offers).toMatchObject({ price: 499_000 })
    expect(productJsonLd(product({ salePrice: 600_000 }), undefined, ORIGIN).offers).toMatchObject({ price: 545_000 })
  })

  it('says sold out when it is', () => {
    const ld = productJsonLd(product({ inStock: false, stockQty: 0 }), undefined, ORIGIN)
    expect(ld.offers).toMatchObject({ availability: 'https://schema.org/OutOfStock' })
  })

  it('offers a sold-out product at its full price, as every page shows it', () => {
    const ld = productJsonLd(product({ inStock: false, stockQty: 0, salePrice: 200_000 }), undefined, ORIGIN)
    expect(ld.offers).toMatchObject({ price: 545_000 })
  })

  it('carries a rating only when there are approved reviews', () => {
    expect(productJsonLd(product(), { avg: 4.666, count: 3 }, ORIGIN).aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.7,
      reviewCount: 3,
    })
    expect(productJsonLd(product(), { avg: 0, count: 0 }, ORIGIN)).not.toHaveProperty('aggregateRating')
    expect(productJsonLd(product(), undefined, ORIGIN)).not.toHaveProperty('aggregateRating')
  })

  it('gives an absolute image, and none rather than the logo without photos', () => {
    const image = productJsonLd(product(), undefined, ORIGIN).image as string[]
    expect(image).toHaveLength(1)
    expect(image[0]).toMatch(/^https?:\/\/.+\/k2\/01\.webp\?v=\d+$/)
    expect(productJsonLd(product({ hasPhotos: false }), undefined, ORIGIN)).not.toHaveProperty('image')
  })

  it('names the brand from a Brand spec, and never claims one it does not know', () => {
    const branded = product({ specs: [{ label: 'brand', value: 'Keychron' }] })
    expect(productJsonLd(branded, undefined, ORIGIN).brand).toEqual({ '@type': 'Brand', name: 'Keychron' })
    expect(productJsonLd(product(), undefined, ORIGIN)).not.toHaveProperty('brand')
  })

  it('falls back to the tagline when there is no description', () => {
    expect(productJsonLd(product({ description: '' }), undefined, ORIGIN).description).toBe(
      '75% hot-swap with tri-mode wireless.',
    )
  })
})

describe('jsonLdScript', () => {
  it('cannot be broken out of by text an admin typed', () => {
    const name = '</script><script>alert(1)</script><!--'
    const out = jsonLdScript({ name })
    expect(out).not.toContain('<')
    expect(JSON.parse(out).name).toBe(name)
  })
})
