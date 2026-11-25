const DEFAULT = '/account'

/**
 * `callbackUrl` arrives from the query string, so it is attacker-supplied.
 * Only same-site paths are followed; anything else would turn the auth pages
 * into an open redirect. A leading `//` is a protocol-relative URL, not a path,
 * and browsers read `\` as `/` and drop tabs and newlines, so `/\host` and
 * `/<tab>/host` are the same trick.
 */
export function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return DEFAULT
  if (/[\\\u0000-\u001f]/.test(raw)) return DEFAULT
  return raw
}

/** A link to another auth page that keeps the way back, plain for the default. */
export function withCallback(path: string, callbackUrl: string): string {
  return callbackUrl === DEFAULT ? path : `${path}?callbackUrl=${encodeURIComponent(callbackUrl)}`
}
