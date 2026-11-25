// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PrivacyView } from './privacy'

afterEach(cleanup)

describe('PrivacyView', () => {
  it('names only what the account area can change', () => {
    render(<PrivacyView />)
    expect(screen.getByText(/your name, addresses and password can be changed in your account/)).toBeTruthy()
    expect(screen.queryByText(/account details are editable/)).toBeNull()
    // The email is the sign-in and cannot be changed, so nothing offers to.
    expect(screen.queryByText(/for your email/)).toBeNull()
  })
})
