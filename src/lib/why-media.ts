import { r2PublicUrl } from '@/lib/cdn'

/*
 * The homepage "Why TechX" panel shows one photo or one video, whichever the
 * owner uploaded last. The `why_image` setting holds its R2 key; the key's
 * extension carries the kind, so photos stored before video existed keep
 * working unchanged. Shared by the route, the admin uploader and the homepage.
 */

export type WhyMediaKind = 'image' | 'video'

export interface WhyMedia {
  readonly kind: WhyMediaKind
  readonly url: string
}

export const WHY_IMAGE_MAX_BYTES = 10 * 1024 * 1024
/** A square clip of up to 20 s is usually 3-6 MB at 1080p; every visitor who scrolls there downloads it. */
export const WHY_VIDEO_MAX_BYTES = 6 * 1024 * 1024
export const WHY_VIDEO_MAX_MS = 20_000
/** Phone trimmers and audio priming land a "20 s" clip at 20.01-20.05 s. */
export const WHY_VIDEO_TOLERANCE_MS = 100
export const WHY_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']
export const WHY_VIDEO_TYPE = 'video/mp4'

export function whyMediaKindOf(key: string): WhyMediaKind {
  return /\.mp4$/i.test(key) ? 'video' : 'image'
}

export function whyMediaFromKey(key: string | null): WhyMedia | null {
  const url = r2PublicUrl(key)
  return key && url ? { kind: whyMediaKindOf(key), url } : null
}

export interface VideoShape {
  readonly durationMs: number
  readonly width: number
  readonly height: number
}

/** The rule both the admin page and the server apply. A message for the owner, or null. */
export function checkVideoShape(s: VideoShape): string | null {
  if (!Number.isFinite(s.durationMs) || s.durationMs <= 0) return 'Could not read the video length.'
  if (s.durationMs > WHY_VIDEO_MAX_MS + WHY_VIDEO_TOLERANCE_MS) return `Video longer than ${WHY_VIDEO_MAX_MS / 1000} seconds.`
  if (!(s.width > 0) || !(s.height > 0)) return 'Could not read the video size.'
  const slack = Math.max(1, Math.floor(Math.max(s.width, s.height) * 0.01))
  if (Math.abs(s.width - s.height) > slack) return 'Video must be square (1:1).'
  return null
}
