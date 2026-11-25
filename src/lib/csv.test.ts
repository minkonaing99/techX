import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from './csv'

describe('csvCell', () => {
  it('quotes a cell holding a comma, quote or line break, doubling inner quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
  })

  it('defuses text a spreadsheet would run as a formula', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
      expect(csvCell(`${lead}1+1`).replace(/^"/, '').startsWith("'")).toBe(true)
    }
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"')
  })

  it('writes numbers as they are and null as an empty cell', () => {
    expect(csvCell(545000)).toBe('545000')
    expect(csvCell(null)).toBe('')
    expect(csvCell('Keychron')).toBe('Keychron')
  })
})

describe('toCsv', () => {
  it('starts with a BOM, so Excel reads Burmese names, and ends rows with CRLF', () => {
    const out = toCsv(['a', 'b'], [[1, 'x'], [2, null]])
    expect(out.charCodeAt(0)).toBe(0xfeff)
    expect(out.slice(1)).toBe('a,b\r\n1,x\r\n2,\r\n')
  })
})
