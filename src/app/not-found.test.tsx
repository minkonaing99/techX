// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import NotFound from './not-found'

afterEach(cleanup)

describe('NotFound', () => {
  it('keeps the shop button and offers search and contact', () => {
    render(<NotFound />)
    expect(screen.getByRole('link', { name: 'Visit the shop' }).getAttribute('href')).toBe('/shop')
    expect(screen.getByRole('link', { name: 'search for a product' }).getAttribute('href')).toBe('/search')
    expect(screen.getByRole('link', { name: 'contact us' }).getAttribute('href')).toBe('/contact')
    expect(screen.getByRole('link', { name: 'contact us' }).closest('p')?.textContent).toBe(
      'Or search for a product, or contact us about an order.',
    )
  })
})
