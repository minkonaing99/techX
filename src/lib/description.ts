/*
 * Product descriptions are plain text typed in admin. This reads the structure
 * already in them, so the page can lay it out; it only ever splits lines, so
 * markup in a description stays text.
 */

export type DescriptionBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; lines: string[] }

const BULLET = /^[+\-•*]\s+/
/** A line this long is prose wrapped by hand; it flows into the next line. */
export const PROSE_MIN = 60
/** "Key points", "In the box": short, no closing punctuation, more lines follow. */
export const TITLE_MAX = 40

function isTitle(line: string): boolean {
  return (
    line.length <= TITLE_MAX &&
    !/[.!?:,;]$/.test(line) &&
    !BULLET.test(line) &&
    // "1x Monitor" opens box contents, not a section.
    !/^\d/.test(line)
  )
}

/**
 * `flows` says the raw line before this one was long prose, so this line
 * continues it. Decided on the raw line: a merged line is always long and
 * would otherwise swallow every short line after it.
 */
function addLine(blocks: readonly DescriptionBlock[], line: string, flows: boolean): DescriptionBlock[] {
  const last = blocks.at(-1)
  const before = blocks.slice(0, -1)
  if (BULLET.test(line)) {
    const item = line.replace(BULLET, '')
    return last?.kind === 'list'
      ? [...before, { kind: 'list', items: [...last.items, item] }]
      : [...blocks, { kind: 'list', items: [item] }]
  }
  if (last?.kind === 'list' && flows) {
    const items = last.items.slice(0, -1)
    return [...before, { kind: 'list', items: [...items, `${last.items.at(-1)} ${line}`] }]
  }
  if (last?.kind === 'paragraph') {
    const prev = last.lines.at(-1) ?? ''
    const lines = flows ? [...last.lines.slice(0, -1), `${prev} ${line}`] : [...last.lines, line]
    return [...before, { kind: 'paragraph', lines }]
  }
  return [...blocks, { kind: 'paragraph', lines: [line] }]
}

function buildBlocks(lines: readonly string[], start: DescriptionBlock[]): DescriptionBlock[] {
  return lines.reduce(
    (blocks, line, i) => addLine(blocks, line, (lines[i - 1]?.length ?? 0) >= PROSE_MIN),
    start,
  )
}

function groupBlocks(lines: readonly string[]): DescriptionBlock[] {
  const [first, ...rest] = lines
  if (first && rest.length > 0 && isTitle(first)) {
    return buildBlocks(rest, [{ kind: 'heading', text: first }])
  }
  return buildBlocks(lines, [])
}

/** Blank lines part paragraphs; "+ " lines are a list; a short first line titles its group. */
export function formatDescription(text: string): DescriptionBlock[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((group) => group.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((group) => group.length > 0)
    .flatMap(groupBlocks)
}
