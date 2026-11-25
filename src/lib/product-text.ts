import { createHash } from 'node:crypto'

export interface Spec {
  label: string
  value: string
}

/** The words a shopper reads on a product page, as edited in admin or from the Mac. */
export interface ProductText {
  name: string
  tagline: string
  description: string
  specs: readonly Spec[]
}

export type TextField = keyof ProductText
export type TextEdit = Partial<ProductText>

export const TEXT_FIELDS: readonly TextField[] = ['name', 'tagline', 'description', 'specs']

export const TEXT_VERSION_RE = /^[0-9a-f]{64}$/

/**
 * A fingerprint of a product's text, so an edit can land only over the text it
 * was made from. Not `updated_at`: that counts whole seconds, moves on every
 * stock change, and stays put when only the specs change. Compared in code,
 * never in SQL, where the _ci collation calls 'Kestrel' and 'kestrel ' equal.
 */
export function textVersion(t: ProductText): string {
  const canonical = JSON.stringify([t.name, t.tagline, t.description, t.specs.map((s) => [s.label, s.value])])
  return createHash('sha256').update(canonical).digest('hex')
}

function sameSpecs(a: readonly Spec[], b: readonly Spec[]): boolean {
  return a.length === b.length && a.every((s, i) => s.label === b[i]!.label && s.value === b[i]!.value)
}

/** The fields an edit would actually change, in `TEXT_FIELDS` order. */
export function changedFields(before: ProductText, edit: TextEdit): TextField[] {
  return TEXT_FIELDS.filter((f) => {
    if (edit[f] === undefined) return false
    return f === 'specs' ? !sameSpecs(before.specs, edit.specs!) : edit[f] !== before[f]
  })
}

export function applyEdit(before: ProductText, edit: TextEdit): ProductText {
  return {
    name: edit.name ?? before.name,
    tagline: edit.tagline ?? before.tagline,
    description: edit.description ?? before.description,
    specs: edit.specs ?? before.specs,
  }
}
