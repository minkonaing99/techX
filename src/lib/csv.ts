/*
 * CSV for spreadsheets (RFC 4180, CRLF). Cells an admin did not type - customer
 * names, addresses, transaction references - can start with a character a
 * spreadsheet runs as a formula, so those get a leading apostrophe.
 */

type Cell = string | number | null

const FORMULA_LEAD = /^[=+\-@\t\r]/
/** Written as an escape: a literal U+FEFF is invisible and editors strip it. */
const BOM = '\uFEFF'

export function csvCell(value: Cell): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value)
  const text = FORMULA_LEAD.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** With a BOM, so Excel opens UTF-8 (Burmese names) correctly. */
export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','))
  return `${BOM}${lines.join('\r\n')}\r\n`
}
