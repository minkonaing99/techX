// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'

let pathname = '/shop'
let search = ''
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}))

const { NavProgress } = await import('./nav-progress')

function bar(container: HTMLElement): string | null {
  return container.querySelector('[data-nav-progress]')!.getAttribute('data-state')
}

function link(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement('a')
  a.href = href
  a.textContent = href
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v)
  // Next's <Link> cancels the browser navigation itself; jsdom cannot navigate.
  a.addEventListener('click', (e) => e.preventDefault())
  document.body.appendChild(a)
  return a
}

beforeEach(() => {
  pathname = '/shop'
  search = ''
  window.history.replaceState(null, '', '/shop')
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('NavProgress', () => {
  it('is hidden at rest', () => {
    const { container } = render(<NavProgress />)
    expect(bar(container)).toBe('idle')
  })

  it('starts on a click to another page of the shop, and finishes when the page changes', () => {
    vi.useFakeTimers()
    const { container, rerender } = render(<NavProgress />)
    fireEvent.click(link('/product/viper-v3'))
    expect(bar(container)).toBe('loading')

    pathname = '/product/viper-v3'
    rerender(<NavProgress />)
    expect(bar(container)).toBe('done')
    act(() => vi.advanceTimersByTime(400))
    expect(bar(container)).toBe('idle')
  })

  it('treats a new query as a new page', () => {
    const { container, rerender } = render(<NavProgress />)
    fireEvent.click(link('/shop?sort=price'))
    expect(bar(container)).toBe('loading')
    search = 'sort=price'
    rerender(<NavProgress />)
    expect(bar(container)).toBe('done')
  })

  it.each([
    ['another site', () => fireEvent.click(link('https://t.me/your_telegram'))],
    ['a new tab', () => fireEvent.click(link('/product/viper-v3', { target: '_blank' }))],
    ['a download', () => fireEvent.click(link('/receipt.pdf', { download: '' }))],
    ['the current page', () => fireEvent.click(link('/shop'))],
    ['a #hash on this page', () => fireEvent.click(link('/shop#reviews'))],
    ['Ctrl-click', () => fireEvent.click(link('/product/viper-v3'), { ctrlKey: true })],
    ['Cmd-click', () => fireEvent.click(link('/product/viper-v3'), { metaKey: true })],
    ['Shift-click', () => fireEvent.click(link('/product/viper-v3'), { shiftKey: true })],
    ['a middle click', () => fireEvent.click(link('/product/viper-v3'), { button: 1 })],
  ])('stays hidden for %s', (_, click) => {
    const { container } = render(<NavProgress />)
    click()
    expect(bar(container)).toBe('idle')
  })

  it('starts when the tap lands on something inside the link', () => {
    const { container } = render(<NavProgress />)
    const img = document.createElement('img')
    link('/product/viper-v3').appendChild(img)
    fireEvent.click(img)
    expect(bar(container)).toBe('loading')
  })

  it('starts for a full same-site address', () => {
    const { container } = render(<NavProgress />)
    fireEvent.click(link(`${location.origin}/product/viper-v3`))
    expect(bar(container)).toBe('loading')
  })

  it('restarts from empty when tapped again while fading out', async () => {
    const { container, rerender } = render(<NavProgress />)
    fireEvent.click(link('/product/viper-v3'))
    pathname = '/product/viper-v3'
    window.history.replaceState(null, '', '/product/viper-v3')
    rerender(<NavProgress />)
    expect(bar(container)).toBe('done')
    fireEvent.click(link('/shop'))
    expect(bar(container)).toBe('idle')
    await waitFor(() => expect(bar(container)).toBe('loading'))
  })

  it('starts on the browser back and forward buttons', () => {
    const { container } = render(<NavProgress />)
    act(() => {
      window.history.replaceState(null, '', '/product/viper-v3')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(bar(container)).toBe('loading')
  })

  it('finishes when back lands on the other page', () => {
    const { container, rerender } = render(<NavProgress />)
    act(() => {
      window.history.replaceState(null, '', '/product/viper-v3')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    pathname = '/product/viper-v3'
    rerender(<NavProgress />)
    expect(bar(container)).toBe('done')
  })

  it('stays hidden when back only changes the #hash', () => {
    const { container } = render(<NavProgress />)
    act(() => {
      window.history.replaceState(null, '', '/shop#reviews')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(bar(container)).toBe('idle')
  })

  it('gives up after 10 seconds so it never sticks', () => {
    vi.useFakeTimers()
    const { container } = render(<NavProgress />)
    fireEvent.click(link('/product/viper-v3'))
    act(() => vi.advanceTimersByTime(10_000))
    expect(bar(container)).toBe('idle')
  })
})
