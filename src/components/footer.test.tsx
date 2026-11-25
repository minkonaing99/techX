// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Footer } from './footer'

afterEach(cleanup)

/* jsdom loads no CSS, so these pin the Tailwind classes; the layout itself was checked in a browser at 390, 744, 768 and 1024 px. */

const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)

function grid(container: HTMLElement): Element {
  return container.querySelector('footer > div')!
}

/** The grid cell (brand block or link group) holding an element. */
function cell(container: HTMLElement, el: HTMLElement): Element {
  return [...grid(container).children].find((c) => c.contains(el))!
}

describe('Footer layout classes', () => {
  it('is two columns under a full-width brand block on phones, four columns from md', () => {
    const { container } = render(<Footer />)
    expect(classes(grid(container))).toEqual(
      expect.arrayContaining(['grid-cols-2', 'md:grid-cols-[1.4fr_repeat(3,1fr)]', 'md:gap-12', 'md:py-16']),
    )
    expect(classes(cell(container, screen.getByRole('link', { name: 'TechX home' })))).toEqual(
      expect.arrayContaining(['col-span-2', 'md:col-span-1']),
    )
  })

  it('leaves the Shop categories to the menu on phones, and shows them from md', () => {
    const { container } = render(<Footer />)
    expect(classes(cell(container, screen.getByRole('link', { name: 'Keyboards' })))).toEqual(
      expect.arrayContaining(['hidden', 'md:block']),
    )
  })

  it('keeps Company and Support on every screen', () => {
    const { container } = render(<Footer />)
    for (const name of ['Contact', 'FAQ']) {
      expect(cell(container, screen.getByRole('link', { name })).getAttribute('class') ?? '').not.toMatch(/(^|\s)(md:)?hidden(\s|$)/)
    }
  })
})
