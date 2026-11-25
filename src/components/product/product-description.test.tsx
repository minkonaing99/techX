// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ProductDescription } from './product-description'

afterEach(cleanup)

describe('ProductDescription', () => {
  it('renders headings, lists and line breaks from the plain text', () => {
    const { container } = render(
      <ProductDescription text={'Portable monitor.\n\nKey points\n+ 144Hz\n+ HDR\n\nIn the box\n1x Monitor\n2x Cable'} />,
    )
    expect(screen.getByRole('heading', { name: 'Key points' })).toBeTruthy()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['144Hz', 'HDR'])
    expect(container.querySelectorAll('br')).toHaveLength(1)
  })

  it('shows markup in a description as text, never as HTML', () => {
    const { container } = render(<ProductDescription text={'<img src=x onerror=alert(1)>'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
  })
})
