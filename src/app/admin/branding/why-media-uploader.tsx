'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Trash2, Upload } from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  WHY_IMAGE_MAX_BYTES,
  WHY_IMAGE_TYPES,
  WHY_VIDEO_MAX_BYTES,
  WHY_VIDEO_TYPE,
  checkVideoShape,
  type WhyMedia,
  type WhyMediaKind,
} from '@/lib/why-media'
import { readVideoMeta } from './read-video-meta'

interface Props {
  initial: WhyMedia | null
}

interface Pending {
  file: File
  kind: WhyMediaKind
  previewUrl: string
}

interface UploadAnswer {
  url: string
  kind: WhyMediaKind
  faststart?: boolean
}

const ENDPOINT = '/api/v1/admin/site/why-image'
const SLOW_START =
  'Uploaded. This video keeps its index at the end, so it starts a moment late. Export with "Optimize for web" or fast start for a quicker start.'

/** Why the file cannot be used, or null. Videos are read by the browser first; the server checks again. */
async function problemWith(file: File): Promise<string | null> {
  if (file.type === WHY_VIDEO_TYPE) {
    if (file.size > WHY_VIDEO_MAX_BYTES) return 'Video over 6 MB.'
    try {
      return checkVideoShape(await readVideoMeta(file))
    } catch {
      return 'Could not read this video. Use an H.264 MP4.'
    }
  }
  if (!WHY_IMAGE_TYPES.includes(file.type)) return 'Use JPG, PNG, WEBP, or MP4.'
  if (file.size > WHY_IMAGE_MAX_BYTES) return 'File over 10 MB.'
  return null
}

function MediaPreview({ media, local }: { media: WhyMedia; local: boolean }) {
  if (media.kind === 'video') {
    return (
      <video
        src={media.url}
        autoPlay
        muted
        loop
        playsInline
        aria-label="Why section video"
        className="absolute inset-0 h-full w-full object-cover"
      />
    )
  }
  return <Image src={media.url} alt="Why section image" fill className="object-cover" unoptimized={local} />
}

export function WhyMediaUploader({ initial }: Props) {
  const [current, setCurrent] = useState<WhyMedia | null>(initial)
  const [pending, setPending] = useState<Pending | null>(null)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  /** Only the latest pick may land: a slow video check must not overwrite a later choice. */
  const pickId = useRef(0)

  function clearPending() {
    if (pending) URL.revokeObjectURL(pending.previewUrl)
    setPending(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function pickFile(file: File | null) {
    const id = ++pickId.current
    setError('')
    setNotice('')
    clearPending()
    if (!file) return
    const problem = await problemWith(file)
    if (id !== pickId.current) return
    if (problem) {
      setError(problem)
      return
    }
    const kind: WhyMediaKind = file.type === WHY_VIDEO_TYPE ? 'video' : 'image'
    setPending({ file, kind, previewUrl: URL.createObjectURL(file) })
  }

  async function save() {
    if (!pending) return
    setSaving(true)
    setError('')
    const form = new FormData()
    form.append('image', pending.file)
    const res = await api<UploadAnswer>(ENDPOINT, { method: 'POST', body: form })
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? `Upload failed (HTTP ${res.status}).`)
    } else {
      setCurrent({ kind: res.data.kind, url: res.data.url })
      if (res.data.faststart === false) setNotice(SLOW_START)
      clearPending()
    }
    setSaving(false)
  }

  async function remove() {
    setRemoving(true)
    setError('')
    setNotice('')
    const res = await api(ENDPOINT, { method: 'DELETE' })
    if (!res.ok) setError(res.error?.message ?? 'Remove failed.')
    else {
      setCurrent(null)
      clearPending()
    }
    setRemoving(false)
  }

  const shown: WhyMedia | null = pending ? { kind: pending.kind, url: pending.previewUrl } : current

  return (
    <div className="space-y-4">
      <div className="relative aspect-square max-w-[320px] overflow-hidden rounded-[var(--radius)] border border-line bg-sand">
        {shown ? (
          <MediaPreview media={shown} local={Boolean(pending)} />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-muted">No photo or video set</div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-line bg-cream px-4 py-2 text-[13px] text-ink hover:bg-line">
          <Upload size={14} />
          Choose photo or video
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4"
            disabled={saving}
            className="sr-only"
            onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {pending && (
          <button
            onClick={save}
            disabled={saving}
            className="rounded bg-ink px-4 py-2 text-[13px] text-cream disabled:opacity-50"
          >
            {saving ? 'Uploading...' : 'Upload'}
          </button>
        )}

        {current && !pending && (
          <button
            onClick={remove}
            disabled={removing}
            className="inline-flex items-center gap-1.5 rounded border border-line px-4 py-2 text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 size={14} />
            {removing ? 'Removing...' : 'Remove'}
          </button>
        )}

        {pending && (
          <button onClick={clearPending} disabled={saving} className="text-[13px] text-muted underline disabled:opacity-50">
            Cancel
          </button>
        )}
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {notice && <p className="text-[13px] text-ink-soft">{notice}</p>}
      <p className="text-[12px] text-muted">
        JPG, PNG or WEBP up to 10 MB, or a square H.264 MP4 up to 20 seconds and 6 MB. A video plays muted on a
        loop; its sound is ignored. Uploading replaces the current one.
      </p>
    </div>
  )
}
