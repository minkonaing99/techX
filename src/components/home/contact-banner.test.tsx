// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ContactBanner } from './contact-banner'

const FB = 'https://www.facebook.com/your-page'

afterEach(cleanup)

describe('ContactBanner', () => {
  it('invites a message before buying', () => {
    render(<ContactBanner telegram="your_telegram" facebook={FB} />)
    expect(screen.getByRole('heading').textContent).toBe('Connect with us before you buy. Choose carefully.')
  })

  it('links Telegram and the Facebook page, opening outside the shop', () => {
    render(<ContactBanner telegram="your_telegram" facebook={FB} />)
    const telegram = screen.getByRole('link', { name: /Message on Telegram/ })
    const facebook = screen.getByRole('link', { name: /Message on Facebook/ })
    expect(telegram.getAttribute('href')).toBe('https://t.me/your_telegram')
    expect(facebook.getAttribute('href')).toBe(FB)
    for (const link of [telegram, facebook]) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('shows an example question and answer, labelled as an example', () => {
    render(<ContactBanner telegram="your_telegram" facebook={FB} />)
    const chat = screen.getByRole('figure', { name: 'An example of a question we answer' })
    expect(chat.textContent).toContain('I want a quiet keyboard, but I like mechanical. Is there one that is both?')
    expect(chat.textContent).toContain('silent linear switches')
    expect(chat.querySelectorAll('p')).toHaveLength(4)
    // A general example: naming one product would date the banner and favour it.
    expect(chat.textContent).not.toMatch(/Keychron|Logitech|VXE|7Hz|Nubwo|ARZOPA|K2 Pro|MX Master/i)
  })

  it('puts both buttons in one row, ahead of the example', () => {
    render(<ContactBanner telegram="your_telegram" facebook={FB} />)
    const telegram = screen.getByRole('link', { name: /Message on Telegram/ })
    const facebook = screen.getByRole('link', { name: /Message on Facebook/ })
    expect(telegram.parentElement).toBe(facebook.parentElement)
  })

  it('takes a Telegram name written with an @', () => {
    render(<ContactBanner telegram="@your_telegram" facebook={null} />)
    expect(screen.getByRole('link', { name: /Message on Telegram/ }).getAttribute('href')).toBe('https://t.me/your_telegram')
  })

  it('shows only the channels that are set', () => {
    render(<ContactBanner telegram={null} facebook={FB} />)
    expect(screen.queryByRole('link', { name: /Telegram/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Facebook/ })).toBeTruthy()
  })

  it('renders nothing with no way to reach us', () => {
    const { container } = render(<ContactBanner telegram={null} facebook={null} />)
    expect(container.innerHTML).toBe('')
  })
})
