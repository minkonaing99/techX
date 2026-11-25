import { describe, expect, it } from 'vitest'
import { line, prose, specsSchema } from './ops-text'

describe('line', () => {
  const name = line(10)

  it('trims and refuses blank', () => {
    expect(name.parse('  Kestrel ')).toBe('Kestrel')
    expect(name.safeParse('   ').success).toBe(false)
  })

  it.each([
    ['a line break', 'Kes\ntrel'],
    ['a bidi override', 'Kes\u202Etrel'],
    ['a byte-order mark inside the text', 'Kes\uFEFFtrel'],
    ['a line separator', 'Kes\u2028trel'],
    ['an invisible tag character', 'Kes\u{E0041}trel'],
    ['a left-to-right mark', 'Kes\u200Etrel'],
    ['a word joiner', 'Kes\u2060trel'],
    ['a broken surrogate, which MySQL would store as a replacement character', 'Kes\uD83Dtrel'],
  ])('refuses %s', (_, text) => {
    expect(name.safeParse(text).success).toBe(false)
  })

  it('trims a leading byte-order mark like other whitespace', () => {
    expect(name.parse('\uFEFFKestrel')).toBe('Kestrel')
  })

  it('keeps a whole emoji', () => {
    expect(name.parse('Kes \u{1F525}')).toBe('Kes \u{1F525}')
  })

  it('keeps the zero-width space and joiner Burmese uses', () => {
    expect(name.parse('ကီး\u200Bဘုတ်\u200D')).toBe('ကီး\u200Bဘုတ်\u200D')
  })

  it('caps the length after trimming', () => {
    expect(name.safeParse(' 0123456789 ').success).toBe(true)
    expect(name.safeParse('01234567890').success).toBe(false)
  })
})

describe('prose', () => {
  const description = prose(20)

  it('keeps line breaks and tabs', () => {
    expect(description.parse('Gasket\n\n\t+ mount')).toBe('Gasket\n\n\t+ mount')
  })

  it.each([
    ['a bell', 'Gasket\u0007'],
    ['a bidi override', 'Gasket \u202Emount'],
    ['a C1 control', 'Gasket\u0085'],
    ['an invisible tag character', 'Gasket \u{E0049}mount'],
    ['an Arabic letter mark', 'Gasket \u061Cmount'],
  ])('refuses %s', (_, text) => {
    expect(description.safeParse(text).success).toBe(false)
  })

  it('trims and refuses blank', () => {
    expect(description.parse('\n Gasket \n')).toBe('Gasket')
    expect(description.safeParse(' \n ').success).toBe(false)
  })
})

describe('specsSchema', () => {
  it('takes up to 40 one-line rows', () => {
    const row = { label: 'Layout', value: '75%' }
    expect(specsSchema.safeParse(Array(40).fill(row)).success).toBe(true)
    expect(specsSchema.safeParse(Array(41).fill(row)).success).toBe(false)
  })

  it('refuses an 81-character label and a multi-line value', () => {
    expect(specsSchema.safeParse([{ label: 'x'.repeat(81), value: 'v' }]).success).toBe(false)
    expect(specsSchema.safeParse([{ label: 'Layout', value: '75%\nx' }]).success).toBe(false)
  })
})
