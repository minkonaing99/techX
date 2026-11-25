// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RejectionNotice } from './rejection-notice'

afterEach(cleanup)

describe('RejectionNotice', () => {
  it('tells the customer why the slip went back and by when to fix it', () => {
    render(<RejectionNotice reason={'Amount does not match.\nYou sent 540,000.'} deadline="24 Oct 2026, 14:30" />)
    expect(screen.getByRole('heading', { name: /could not accept your slip/i })).toBeTruthy()
    expect(screen.getByText(/You sent 540,000/)).toBeTruthy()
    expect(screen.getByText(/24 Oct 2026, 14:30/)).toBeTruthy()
  })

  it('shows owner text as text, never as markup', () => {
    const { container } = render(<RejectionNotice reason="<img src=x onerror=alert(1)>" deadline="soon" />)
    expect(container.querySelector('img')).toBeNull()
  })
})
