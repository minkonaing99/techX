import { describe, expect, it } from 'vitest'
import { formatDescription } from './description'

describe('formatDescription', () => {
  it('keeps a one-paragraph description as one paragraph', () => {
    expect(formatDescription('Keychron flagship 75% in tri-mode.')).toEqual([
      { kind: 'paragraph', lines: ['Keychron flagship 75% in tri-mode.'] },
    ])
  })

  it('starts a paragraph at a blank line', () => {
    expect(formatDescription('First part.\n\nSecond part.')).toEqual([
      { kind: 'paragraph', lines: ['First part.'] },
      { kind: 'paragraph', lines: ['Second part.'] },
    ])
  })

  it('turns "+ " lines into a list under a short title line', () => {
    expect(formatDescription('Key points\n+ 144Hz refresh\n+ HDR support')).toEqual([
      { kind: 'heading', text: 'Key points' },
      { kind: 'list', items: ['144Hz refresh', 'HDR support'] },
    ])
  })

  it('keeps short lines such as box contents on their own lines', () => {
    expect(formatDescription('In the box\n1x Monitor\n2x USB-C cable')).toEqual([
      { kind: 'heading', text: 'In the box' },
      { kind: 'paragraph', lines: ['1x Monitor', '2x USB-C cable'] },
    ])
  })

  it('reflows prose that was hard-wrapped mid-sentence', () => {
    const wrapped =
      'A single-monitor arm that clamps to your desk and lifts the screen off it \ncompletely. The gas spring holds any position you set.'
    expect(formatDescription(wrapped)).toEqual([
      {
        kind: 'paragraph',
        lines: ['A single-monitor arm that clamps to your desk and lifts the screen off it completely. The gas spring holds any position you set.'],
      },
    ])
  })

  it('does not make a heading of a sentence or of a line that stands alone', () => {
    expect(formatDescription('Works with any brand.\n+ VESA 75')).toEqual([
      { kind: 'paragraph', lines: ['Works with any brand.'] },
      { kind: 'list', items: ['VESA 75'] },
    ])
    expect(formatDescription('Note')).toEqual([{ kind: 'paragraph', lines: ['Note'] }])
  })

  it('reads Windows line endings and ignores extra blank lines', () => {
    expect(formatDescription('One.\r\n\r\n\r\nTwo.\r\n')).toEqual([
      { kind: 'paragraph', lines: ['One.'] },
      { kind: 'paragraph', lines: ['Two.'] },
    ])
  })

  it('returns nothing for an empty description', () => {
    expect(formatDescription('  \n ')).toEqual([])
  })

  it('leaves markup as text: it only ever splits lines', () => {
    expect(formatDescription('<b>Bold</b> <script>x</script>')).toEqual([
      { kind: 'paragraph', lines: ['<b>Bold</b> <script>x</script>'] },
    ])
  })

  it('flows only from a long line, not from a line it already joined', () => {
    const long = 'x'.repeat(70)
    expect(formatDescription(`${long}\nShort a\nShort b\nShort c`)).toEqual([
      { kind: 'paragraph', lines: [`${long} Short a`, 'Short b', 'Short c'] },
    ])
  })

  it('flows from 60 characters, not from 59', () => {
    expect(formatDescription(`${'a'.repeat(60)}\nnext`)).toEqual([
      { kind: 'paragraph', lines: [`${'a'.repeat(60)} next`] },
    ])
    expect(formatDescription(`${'a'.repeat(59)}\nnext`)).toEqual([
      { kind: 'paragraph', lines: ['a'.repeat(59), 'next'] },
    ])
  })

  it('does not take a quantity line for a heading', () => {
    expect(formatDescription('1x Monitor\n2x USB-C cable')).toEqual([
      { kind: 'paragraph', lines: ['1x Monitor', '2x USB-C cable'] },
    ])
  })

  it('keeps a bullet that wraps onto a second line as one item', () => {
    const item = 'New 10mm dynamic driver with PU and metal composite diaphragm,'
    expect(formatDescription(`+ ${item}\nfaster response\n+ Bass lifted 3dB`)).toEqual([
      { kind: 'list', items: [`${item} faster response`, 'Bass lifted 3dB'] },
    ])
  })
})
