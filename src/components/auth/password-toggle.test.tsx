// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PasswordToggle } from './auth-parts'

afterEach(cleanup)

describe('PasswordToggle', () => {
  it('says password when no field is named', () => {
    const { rerender } = render(<PasswordToggle revealed={false} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy()
    rerender(<PasswordToggle revealed onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy()
  })
})
