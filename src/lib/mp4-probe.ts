/*
 * Reads the few facts the "Why TechX" video slot needs from an MP4 -
 * duration, the video track's size and codec, and whether moov comes before
 * the media data - without decoding a frame. Pure and safe on untrusted
 * bytes: it never reads the media data, never changes its input, and never
 * throws (any broken structure is `truncated`).
 */

export interface Mp4Info {
  /** mvhd duration in milliseconds, rounded. */
  readonly durationMs: number
  /** The video track's tkhd size, rounded to whole pixels. */
  readonly width: number
  readonly height: number
  /** First sample entry of the video track, e.g. `avc1`. */
  readonly codec: string
  /** moov comes before the first mdat, so playback can start before the download ends. */
  readonly faststart: boolean
}

export type Mp4ProbeError = 'not_mp4' | 'truncated' | 'no_moov' | 'no_video_track' | 'bad_duration' | 'fragmented'

export type Mp4ProbeResult =
  | { readonly ok: true; readonly info: Mp4Info }
  | { readonly ok: false; readonly reason: Mp4ProbeError }

interface Box {
  readonly type: string
  readonly payload: number
  readonly end: number
}

class ProbeFail extends Error {
  constructor(readonly reason: Mp4ProbeError) {
    super(reason)
  }
}

const fourcc = (view: DataView, at: number) =>
  String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3))

/** The boxes between `start` and `end`, or null when a size runs short or past `end`. */
function readBoxes(view: DataView, start: number, end: number): readonly Box[] | null {
  const boxes: Box[] = []
  let at = start
  while (at < end) {
    if (end - at < 8) return null
    let size = view.getUint32(at)
    let header = 8
    if (size === 1) {
      if (end - at < 16) return null
      const large = view.getBigUint64(at + 8)
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null
      size = Number(large)
      header = 16
    } else if (size === 0) {
      size = end - at
    }
    if (size < header || at + size > end) return null
    boxes.push({ type: fourcc(view, at + 4), payload: at + header, end: at + size })
    at += size
  }
  return boxes
}

function children(view: DataView, box: Box): readonly Box[] {
  const kids = readBoxes(view, box.payload, box.end)
  if (!kids) throw new ProbeFail('truncated')
  return kids
}

function child(view: DataView, box: Box, type: string): Box {
  const found = children(view, box).find((b) => b.type === type)
  if (!found) throw new ProbeFail('truncated')
  return found
}

function needBytes(box: Box, n: number): void {
  if (box.end - box.payload < n) throw new ProbeFail('truncated')
}

function parseMvhd(view: DataView, box: Box): number {
  const p = box.payload
  needBytes(box, 1)
  const v1 = view.getUint8(p) === 1
  needBytes(box, v1 ? 32 : 20)
  const timescale = view.getUint32(p + (v1 ? 20 : 12))
  const duration = v1 ? view.getBigUint64(p + 24) : BigInt(view.getUint32(p + 16))
  const unknown = v1 ? 0xffffffffffffffffn : 0xffffffffn
  if (timescale === 0 || duration === 0n || duration === unknown || duration > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ProbeFail('bad_duration')
  }
  return Math.round((Number(duration) * 1000) / timescale)
}

/** Width and height are 16.16 fixed point at the end of tkhd. */
function parseTkhd(view: DataView, box: Box): { width: number; height: number } {
  const p = box.payload
  needBytes(box, 1)
  const v1 = view.getUint8(p) === 1
  needBytes(box, v1 ? 96 : 84)
  const at = p + (v1 ? 88 : 76)
  return { width: Math.round(view.getUint32(at) / 65536), height: Math.round(view.getUint32(at + 4) / 65536) }
}

function handlerType(view: DataView, mdia: Box): string {
  const hdlr = child(view, mdia, 'hdlr')
  needBytes(hdlr, 12)
  return fourcc(view, hdlr.payload + 8)
}

function sampleEntryType(view: DataView, stbl: Box): string {
  const stsd = child(view, stbl, 'stsd')
  needBytes(stsd, 16)
  if (view.getUint32(stsd.payload + 4) < 1) throw new ProbeFail('truncated')
  return fourcc(view, stsd.payload + 12)
}

function videoTrack(view: DataView, moovKids: readonly Box[]): Box {
  const trak = moovKids
    .filter((b) => b.type === 'trak')
    .find((t) => handlerType(view, child(view, t, 'mdia')) === 'vide')
  if (!trak) throw new ProbeFail('no_video_track')
  return trak
}

function probe(bytes: Uint8Array): Mp4Info {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 8 || fourcc(view, 4) !== 'ftyp') throw new ProbeFail('not_mp4')
  const top = readBoxes(view, 0, bytes.length)
  if (!top) throw new ProbeFail('truncated')
  if (top.some((b) => b.type === 'moof')) throw new ProbeFail('fragmented')
  const moovAt = top.findIndex((b) => b.type === 'moov')
  if (moovAt < 0) throw new ProbeFail('no_moov')
  const mdatAt = top.findIndex((b) => b.type === 'mdat')
  const moovKids = children(view, top[moovAt]!)
  if (moovKids.some((b) => b.type === 'mvex')) throw new ProbeFail('fragmented')
  const mvhd = moovKids.find((b) => b.type === 'mvhd')
  if (!mvhd) throw new ProbeFail('truncated')
  const durationMs = parseMvhd(view, mvhd)
  const trak = videoTrack(view, moovKids)
  const stbl = child(view, child(view, child(view, trak, 'mdia'), 'minf'), 'stbl')
  return {
    durationMs,
    ...parseTkhd(view, child(view, trak, 'tkhd')),
    codec: sampleEntryType(view, stbl),
    faststart: mdatAt < 0 || moovAt < mdatAt,
  }
}

export function probeMp4(bytes: Uint8Array): Mp4ProbeResult {
  try {
    return { ok: true, info: probe(bytes) }
  } catch (err) {
    return { ok: false, reason: err instanceof ProbeFail ? err.reason : 'truncated' }
  }
}
