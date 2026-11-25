// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Price } from './price'

afterEach(cleanup)

function pair(): HTMLElement {
  return screen.getByLabelText('Was Ks 150,000, now Ks 100,000')
}

describe('Price', () => {
  it('keeps the was/now pair on one row by default', () => {
    render(<Price priceMmk={150_000} salePriceMmk={100_000} />)
    expect(pair().className).not.toContain('flex-col')
  })

  it('stacks the pair on a phone when asked, one row again from sm up', () => {
    render(<Price priceMmk={150_000} salePriceMmk={100_000} stackOnPhone />)
    expect(pair().className).toContain('flex-col')
    expect(pair().className).toContain('sm:flex-row')
  })

  it('never breaks "Ks" from its number', () => {
    render(<Price priceMmk={150_000} salePriceMmk={100_000} stackOnPhone />)
    for (const el of pair().children) expect(el.className).toContain('whitespace-nowrap')
    cleanup()
    render(<Price priceMmk={150_000} salePriceMmk={null} />)
    expect(screen.getByText('Ks 150,000').className).toContain('whitespace-nowrap')
  })
})
