/*
 * Builds minimal MP4 files box by box, for the parser tests. Only the boxes
 * the parser reads are real; everything else is zeros.
 */

export interface Mp4Spec {
  timescale?: number
  duration?: number | bigint
  mvhdVersion?: 0 | 1
  width?: number
  height?: number
  tkhdVersion?: 0 | 1
  codec?: string
  moovAtEnd?: boolean
  audioTrackFirst?: boolean
  fragmented?: boolean
  mdatBytes?: number
  largeMdat?: boolean
}

const ascii = (s: string) => new TextEncoder().encode(s)

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n)
  return b
}

function u64(n: number | bigint): Uint8Array {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setBigUint64(0, BigInt(n))
  return b
}

const zeros = (n: number) => new Uint8Array(n)

export function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const body = concat(...parts)
  return concat(u32(8 + body.length), ascii(type), body)
}

function mvhd(s: Required<Mp4Spec>): Uint8Array {
  if (s.mvhdVersion === 1) {
    return box('mvhd', u32(0x01000000), zeros(16), u32(s.timescale), u64(s.duration), zeros(80))
  }
  return box('mvhd', u32(0), zeros(8), u32(s.timescale), u32(Number(s.duration)), zeros(80))
}

/** Width and height as 16.16 fixed point. */
function tkhd(version: 0 | 1, width: number, height: number): Uint8Array {
  const fixed = (n: number) => u32(Math.round(n * 65536))
  const head = version === 1 ? concat(u32(0x01000000), zeros(32)) : concat(u32(0), zeros(20))
  return box('tkhd', head, zeros(52), fixed(width), fixed(height))
}

function trak(handler: string, codec: string, version: 0 | 1, width: number, height: number): Uint8Array {
  const hdlr = box('hdlr', u32(0), zeros(4), ascii(handler), zeros(12), zeros(1))
  const stsd = box('stsd', u32(0), u32(1), box(codec, zeros(8)))
  return box('trak', tkhd(version, width, height), box('mdia', hdlr, box('minf', box('stbl', stsd))))
}

function mdat(bytes: number, large: boolean): Uint8Array {
  if (!large) return box('mdat', zeros(bytes))
  return concat(u32(1), ascii('mdat'), u64(16 + bytes), zeros(bytes))
}

export function mp4(spec: Mp4Spec = {}): Uint8Array {
  const s: Required<Mp4Spec> = {
    timescale: 1000,
    duration: 13000,
    mvhdVersion: 0,
    width: 1080,
    height: 1080,
    tkhdVersion: 0,
    codec: 'avc1',
    moovAtEnd: false,
    audioTrackFirst: false,
    fragmented: false,
    mdatBytes: 16,
    largeMdat: false,
    ...spec,
  }
  const video = trak('vide', s.codec, s.tkhdVersion, s.width, s.height)
  const audio = trak('soun', 'mp4a', 0, 0, 0)
  const traks = s.audioTrackFirst ? [audio, video] : [video]
  const mvex = s.fragmented ? [box('mvex', box('trex', zeros(24)))] : []
  const moov = box('moov', mvhd(s), ...traks, ...mvex)
  const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isomavc1'))
  const data = mdat(s.mdatBytes, s.largeMdat)
  return s.moovAtEnd ? concat(ftyp, data, moov) : concat(ftyp, moov, data)
}
