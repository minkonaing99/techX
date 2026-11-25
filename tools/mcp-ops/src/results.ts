import type { PreviewStore } from './preview-store.ts'

/* What every tool answers, shared by handlers.ts and handlers-edit.ts. */

export interface ToolResult {
  text: string
  isError?: boolean
}

export const fail = (text: string): ToolResult => ({ text, isError: true })
export const failure = (err: unknown) => fail(err instanceof Error ? err.message : String(err))

/** Keeps a plan for apply_preview and says so, with the warnings to check first. */
export function stored<T>(previews: PreviewStore<T>, plan: T, preview: string, warnings: string[]): ToolResult {
  const id = previews.put(plan)
  const text = [
    'Preview only - nothing has changed yet.',
    preview,
    ...(warnings.length > 0 ? ['', 'Check before applying:', ...warnings.map((w) => `- ${w}`)] : []),
    '',
    `previewId: ${id} (valid 10 minutes). Show this preview to the owner. Do not call apply_preview until the owner approves it in this conversation.`,
  ].join('\n')
  return { text }
}
