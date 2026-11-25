import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { fail, ok, rateLimited } from '@/lib/api-response'
import sharp from 'sharp'
import { requireAdmin } from '@/lib/admin-guard'
import { clientKey, rateLimit } from '@/lib/rate-limit'
import { r2PublicUrl } from '@/lib/cdn'
import { probeMp4, type Mp4ProbeError } from '@/lib/mp4-probe'
import { deletePublic, putPublic } from '@/lib/r2'
import { getSetting, setSetting, deleteSetting } from '@/lib/site-settings'
import {
  WHY_IMAGE_MAX_BYTES,
  WHY_IMAGE_TYPES,
  WHY_VIDEO_MAX_BYTES,
  WHY_VIDEO_TYPE,
  checkVideoShape,
  whyMediaKindOf,
} from '@/lib/why-media'
import { revalidateTag } from 'next/cache'

/*
 * The homepage "Why TechX" panel: one photo or one video, whichever was
 * uploaded last. The stored key's extension carries the kind (`.mp4` is a
 * video), so photos stored before video existed keep working. The form field
 * stays `image` for both.
 */

const SETTING_KEY = 'why_image'
/** The largest file plus room for the multipart wrapper; anything declared bigger is refused unread. */
const MAX_BODY_BYTES = WHY_IMAGE_MAX_BYTES + 64 * 1024
/** About 7000x7000. A 10 MB file can declare far more and decode to gigabytes. */
const MAX_INPUT_PIXELS = 50_000_000
/** Only H.264 plays everywhere; iPhone HEVC shows as a black box on many Androids. */
const H264 = new Set(['avc1', 'avc3'])

const PROBE_MESSAGE: Record<Mp4ProbeError, string> = {
  not_mp4: 'This file is not an MP4 video.',
  truncated: 'Could not read this video. Export it again as an H.264 MP4.',
  no_moov: 'Could not read this video. Export it again as an H.264 MP4.',
  no_video_track: 'This MP4 has no video track.',
  bad_duration: 'Could not read the video length.',
  fragmented: 'Streaming (fragmented) MP4 is not supported. Export a regular MP4.',
}

interface Processed {
  bytes: Buffer
  contentType: 'image/webp' | 'video/mp4'
  ext: 'webp' | 'mp4'
  faststart?: boolean
}

/**
 * Content-addressed key. `putPublic` serves public objects
 * `max-age=31536000, immutable`, so a replacement written to a fixed key would
 * sit behind the year-old cached copy at the CDN edge and in every browser that
 * had already loaded it. Naming the object after its own bytes makes that
 * promise true: different file, different URL, nothing to purge.
 */
function keyFor(bytes: Buffer, ext: Processed['ext']): string {
  return `site/why-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${ext}`
}

async function processPhoto(file: File): Promise<Processed | NextResponse> {
  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    const bytes = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88, alphaQuality: 100 })
      .toBuffer()
    return { bytes, contentType: 'image/webp', ext: 'webp' }
  } catch {
    return fail('VALIDATION_ERROR', 'Could not read image.', 400)
  }
}

/** Stored byte for byte: there is no transcoder on the host, so the file must already be web-ready. */
async function processVideo(file: File): Promise<Processed | NextResponse> {
  if (file.size > WHY_VIDEO_MAX_BYTES) return fail('VALIDATION_ERROR', 'Video over 6 MB.', 413)
  const bytes = Buffer.from(await file.arrayBuffer())
  const probed = probeMp4(new Uint8Array(bytes))
  if (!probed.ok) return fail('VALIDATION_ERROR', PROBE_MESSAGE[probed.reason], 400)
  if (!H264.has(probed.info.codec)) return fail('VALIDATION_ERROR', 'Video must be H.264 MP4.', 415)
  const problem = checkVideoShape(probed.info)
  if (problem) return fail('VALIDATION_ERROR', problem, 400)
  return { bytes, contentType: 'video/mp4', ext: 'mp4', faststart: probed.info.faststart }
}

export async function POST(req: Request): Promise<NextResponse> {
  const denied = await requireAdmin()
  if (denied) return denied

  const limit = rateLimit({ key: clientKey(req, 'admin:why-image'), limit: 20, windowMs: 60 * 60 * 1000 })
  if (!limit.allowed) {
    return rateLimited('Too many uploads.', limit.retryAfterSeconds)
  }

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return fail('VALIDATION_ERROR', 'File over 10 MB.', 413)
  }
  const form = await req.formData().catch(() => null)
  if (!form) return fail('VALIDATION_ERROR', 'Invalid form data.', 400)
  const file = form.get('image')
  if (!(file instanceof File)) return fail('VALIDATION_ERROR', 'Missing image file.', 400)
  if (file.size > WHY_IMAGE_MAX_BYTES) return fail('VALIDATION_ERROR', 'File over 10 MB.', 413)

  const isVideo = file.type === WHY_VIDEO_TYPE
  if (!isVideo && !WHY_IMAGE_TYPES.includes(file.type)) {
    return fail('VALIDATION_ERROR', 'Use JPG, PNG, WEBP, or MP4.', 415)
  }
  const processed = isVideo ? await processVideo(file) : await processPhoto(file)
  if (processed instanceof NextResponse) return processed

  const key = keyFor(processed.bytes, processed.ext)
  try {
    await putPublic(key, processed.bytes, processed.contentType)
  } catch {
    return fail('UPSTREAM_ERROR', 'Could not store the file.', 502)
  }

  // Point at the new object before dropping the old one, so a failure here
  // leaves an orphan rather than a setting aimed at a deleted key. This also
  // removes a photo replaced by a video, and the other way round.
  const previous = await getSetting(SETTING_KEY)
  await setSetting(SETTING_KEY, key)
  if (previous && previous !== key) await deletePublic(previous)
  revalidateTag('site-settings')

  const faststart = processed.faststart === undefined ? {} : { faststart: processed.faststart }
  return ok({ url: r2PublicUrl(key), kind: whyMediaKindOf(key), ...faststart })
}

export async function GET(): Promise<NextResponse> {
  const denied = await requireAdmin()
  if (denied) return denied

  const key = await getSetting(SETTING_KEY)
  return ok({ url: key ? r2PublicUrl(key) : null, kind: key ? whyMediaKindOf(key) : null })
}

export async function DELETE(): Promise<NextResponse> {
  const denied = await requireAdmin()
  if (denied) return denied

  // Whatever the setting points at, including a legacy fixed `site/why.webp`.
  const key = await getSetting(SETTING_KEY)
  if (key) await deletePublic(key)
  await deleteSetting(SETTING_KEY)
  revalidateTag('site-settings')

  return ok({ ok: true })
}
