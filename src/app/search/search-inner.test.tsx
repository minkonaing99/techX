// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SearchInner } from './search-inner'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(cleanup)

describe('search box', () => {
  it('has a label, not just a placeholder', () => {
    render(<SearchInner products={[]} />)
    const box = screen.getByLabelText(/search products/i) as HTMLInputElement
    expect(box.type).toBe('search')
  })

  it('is a search landmark whose wrapper shows the focus ring the input suppresses', () => {
    render(<SearchInner products={[]} />)
    expect(screen.getByRole('search').className).toContain('has-[:focus-visible]:outline-accent')
  })

  it('announces how many products match as you type', () => {
    render(<SearchInner products={[]} />)
    fireEvent.change(screen.getByLabelText(/search products/i), { target: { value: 'quiet keyboard' } })
    expect(screen.getByRole('status').textContent).toBe('No products match your query.')
  })
})
