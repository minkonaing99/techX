// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { FaqView } from './faq'

afterEach(cleanup)

describe('FaqView payment deadline', () => {
  it('points to the exact time, says a slip stops the clock and where to get help fast', () => {
    render(<FaqView locale="en" />)
    expect(screen.getByText(/the exact time is on your order page/)).toBeTruthy()
    expect(screen.getByText(/Once your slip is uploaded, the order is not cancelled while we check it\./)).toBeTruthy()
    expect(screen.getByText(/Telegram is the fastest way to reach us/)).toBeTruthy()
  })

  it('says the same in Burmese', () => {
    render(<FaqView locale="my" />)
    expect(screen.getByText(/ငွေလွှဲပြေစာ တင်ပြီးပါက စစ်ဆေးနေစဉ် အော်ဒါကို မပယ်ဖျက်ပါ/)).toBeTruthy()
  })

  it('answers the cash-on-delivery question with the monitor exception', () => {
    render(<FaqView locale="en" />)
    expect(screen.getByText(/except monitors/)).toBeTruthy()
    cleanup()
    render(<FaqView locale="my" />)
    expect(screen.getByText(/မော်နီတာများအတွက် မရပါ။/)).toBeTruthy()
  })

  // Checkout does collect personal details and slips; only card details are never asked for.
  it('says no card details are entered, without claiming nothing sensitive is', () => {
    render(<FaqView locale="en" />)
    expect(screen.getByText(/no card details are ever entered here/)).toBeTruthy()
    expect(screen.getByText(/covered by the privacy policy/)).toBeTruthy()
    expect(screen.queryByText(/nothing sensitive/)).toBeNull()
  })
})

describe('FaqView jump links', () => {
  for (const [locale, label] of [
    ['en', 'On this page'],
    ['my', 'ဤစာမျက်နှာတွင်'],
  ] as const) {
    it(`links to every group, each to a section on the page (${locale})`, () => {
      const { container } = render(<FaqView locale={locale} />)
      const nav = screen.getByRole('navigation', { name: label })
      const links = [...nav.querySelectorAll('a')]
      const headings = [...container.querySelectorAll('section > h2')].map((h) => h.textContent)
      expect(links.map((a) => a.textContent)).toEqual(headings)
      const ids = links.map((a) => a.getAttribute('href')!.slice(1))
      expect(new Set(ids).size).toBe(ids.length)
      for (const [i, id] of ids.entries()) {
        expect(container.querySelector(`section#${id} > h2`)?.textContent).toBe(headings[i])
      }
    })
  }

  it('uses the same anchors in both languages', () => {
    const anchors = (locale: 'en' | 'my') => {
      render(<FaqView locale={locale} />)
      const nav = screen.getByRole('navigation', { name: locale === 'en' ? 'On this page' : 'ဤစာမျက်နှာတွင်' })
      const hrefs = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'))
      cleanup()
      return hrefs
    }
    expect(anchors('my')).toEqual(anchors('en'))
    expect(anchors('en')).toEqual(['#payment', '#delivery', '#stock', '#after-sale', '#account'])
  })

  // Swapping two Burmese groups together with their ids would pass the checks above.
  it('gives each anchor the same number of questions in both languages', () => {
    const counts = (locale: 'en' | 'my') => {
      const { container } = render(<FaqView locale={locale} />)
      const out = [...container.querySelectorAll('section[id]')].map(
        (sec) => `${sec.id}:${sec.querySelectorAll('dt').length}`,
      )
      cleanup()
      return out
    }
    expect(counts('my')).toEqual(counts('en'))
  })
})
