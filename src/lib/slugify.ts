/**
 * Normalize a product name into a URL-safe slug.
 * Lowercased, non-alnum collapsed to "-", no leading/trailing dashes, at most 64 characters.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    // Capped at the 64-character `products.id` column (id = slug), then
    // trimmed again so the cut cannot leave a trailing dash.
    .slice(0, 64)
    .replace(/^-+|-+$/g, '')
}

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
