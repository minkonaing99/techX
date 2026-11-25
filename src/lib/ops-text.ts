import { z } from 'zod'

/*
 * Characters that hide or reorder text - C0 and C1 controls, bidi overrides,
 * isolates and marks, word joiners and invisible operators, line separators,
 * the byte-order mark, broken surrogates (stored by MySQL as U+FFFD, which would
 * change the text's fingerprint), and Unicode tag characters (invisible to the owner but
 * read by a model, so they can carry hidden instructions) - so the shop would
 * show something other than what the owner approved. Zero-width spaces and
 * joiners stay: Burmese text uses them.
 */
export const HIDDEN = /[\p{Cc}\p{Cs}\u061C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u2028\u2029\uFEFF\u{E0000}-\u{E007F}]/u
/** The same, less the line breaks and tabs a description may hold. */
export const HIDDEN_IN_PROSE = /[\p{Cs}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u2028\u2029\uFEFF\u{E0000}-\u{E007F}]/u

/** One line of plain text: trimmed, not blank, nothing hidden. */
export const line = (max: number) =>
  z.string().trim().min(1).max(max).refine((s) => !HIDDEN.test(s), 'Must be one line of plain text.')

/** Paragraphs allowed: trimmed, not blank, nothing hidden but line breaks and tabs kept. */
export const prose = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !HIDDEN_IN_PROSE.test(s), 'The description contains hidden or reordering characters.')

/** A product's whole spec list: up to 40 one-line rows, in display order. */
export const specsSchema = z.array(z.object({ label: line(80), value: line(200) })).max(40)
