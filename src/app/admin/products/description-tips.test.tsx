// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PROSE_MIN, TITLE_MAX, formatDescription } from '@/lib/description'
import { DESCRIPTION_EXAMPLE, DescriptionTips } from './description-tips'

afterEach(cleanup)

describe('DescriptionTips', () => {
  it('states the rules with the numbers the formatter uses', () => {
    render(<DescriptionTips id="tips" />)
    expect(screen.getByText('Formatting tips')).toBeTruthy()
    expect(screen.getByText(new RegExp(`under ${TITLE_MAX} characters`))).toBeTruthy()
    expect(screen.getByText(new RegExp(`under ${PROSE_MIN} characters`))).toBeTruthy()
    expect(document.getElementById('tips')).not.toBeNull()
  })

  it('shows an example that formats the way the tips say', () => {
    expect(formatDescription(DESCRIPTION_EXAMPLE).map((b) => b.kind)).toEqual([
      'paragraph',
      'heading',
      'list',
      'heading',
      'paragraph',
    ])
  })
})
