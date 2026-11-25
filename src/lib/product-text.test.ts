import { describe, expect, it } from 'vitest'
import { applyEdit, changedFields, textVersion, type ProductText } from './product-text'

const TEXT: ProductText = {
  name: 'Kestrel 75',
  tagline: 'Gasket-mount 75%',
  description: 'Quiet.\n\nHot-swap.',
  specs: [
    { label: 'Layout', value: '75%' },
    { label: 'Switches', value: 'Linear' },
  ],
}

describe('textVersion', () => {
  it('is a stable 64-character hex fingerprint', () => {
    expect(textVersion(TEXT)).toMatch(/^[0-9a-f]{64}$/)
    expect(textVersion({ ...TEXT, specs: [...TEXT.specs] })).toBe(textVersion(TEXT))
  })

  // MySQL's _ci collation would call these equal; the fingerprint must not.
  it.each([
    ['letter case', { ...TEXT, name: 'kestrel 75' }],
    ['a trailing space', { ...TEXT, name: 'Kestrel 75 ' }],
    ['spec order', { ...TEXT, specs: [TEXT.specs[1]!, TEXT.specs[0]!] }],
    ['where a spec splits label from value', { ...TEXT, specs: [{ label: 'Lay', value: 'out75%' }, TEXT.specs[1]!] }],
    ['a paragraph break', { ...TEXT, description: 'Quiet.\nHot-swap.' }],
  ])('changes with %s', (_, other) => {
    expect(textVersion(other)).not.toBe(textVersion(TEXT))
  })
})

describe('changedFields', () => {
  it('lists only the fields that differ, in a fixed order', () => {
    expect(changedFields(TEXT, { specs: [], name: 'Kestrel 75 Pro' })).toEqual(['name', 'specs'])
  })

  it('treats a field sent with its current value as unchanged', () => {
    expect(changedFields(TEXT, { name: 'Kestrel 75', specs: [...TEXT.specs] })).toEqual([])
  })

  it('sees a spec row edited in place', () => {
    expect(changedFields(TEXT, { specs: [TEXT.specs[0]!, { label: 'Switches', value: 'Tactile' }] })).toEqual([
      'specs',
    ])
  })
})

describe('applyEdit', () => {
  it('keeps the fields not sent', () => {
    expect(applyEdit(TEXT, { tagline: 'New' })).toEqual({ ...TEXT, tagline: 'New' })
  })
})
