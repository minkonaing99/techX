import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { box, mp4 } from '@/test/mp4-fixture'
import { probeMp4 } from './mp4-probe'

const fixture = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), 'src/test/fixtures', name)))

function info(bytes: Uint8Array) {
  const r = probeMp4(bytes)
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`)
  return r.info
}

const reason = (bytes: Uint8Array) => {
  const r = probeMp4(bytes)
  return r.ok ? 'ok' : r.reason
}

describe('probeMp4 - reading the parts that matter', () => {
  it('reads the duration from mvhd v0 and v1', () => {
    expect(info(mp4({ timescale: 600, duration: 7800 })).durationMs).toBe(13_000)
    expect(info(mp4({ mvhdVersion: 1, timescale: 90_000, duration: 1_170_000n })).durationMs).toBe(13_000)
  })

  it('reads the video size from tkhd v0 and v1, rounding fixed point', () => {
    expect(info(mp4({ width: 720, height: 720 }))).toMatchObject({ width: 720, height: 720 })
    expect(info(mp4({ tkhdVersion: 1, width: 1080, height: 1081 }))).toMatchObject({ width: 1080, height: 1081 })
    expect(info(mp4({ width: 719.6, height: 720.4 }))).toMatchObject({ width: 720, height: 720 })
  })

  it('skips an audio track listed before the video track', () => {
    expect(info(mp4({ audioTrackFirst: true, width: 640, height: 640 }))).toMatchObject({ width: 640, codec: 'avc1' })
  })

  it('passes the codec through as written', () => {
    expect(info(mp4({ codec: 'hvc1' })).codec).toBe('hvc1')
  })

  it('finds moov before or after the media data, and says which', () => {
    expect(info(mp4()).faststart).toBe(true)
    expect(info(mp4({ moovAtEnd: true }))).toMatchObject({ faststart: false, durationMs: 13_000 })
  })

  it('steps over a 64-bit sized mdat', () => {
    expect(info(mp4({ largeMdat: true, moovAtEnd: true })).durationMs).toBe(13_000)
  })

  it('treats a last box of size 0 as running to the end', () => {
    const bytes = mp4({ moovAtEnd: false })
    const copy = new Uint8Array(bytes)
    // mdat is last: rewrite its size to 0.
    new DataView(copy.buffer).setUint32(copy.length - 24, 0)
    expect(info(copy).durationMs).toBe(13_000)
  })

  it('reads real encoder output', () => {
    expect(info(fixture('square-faststart.mp4'))).toMatchObject({ width: 64, height: 64, codec: 'avc1', faststart: true })
    expect(info(fixture('square-moov-end.mp4'))).toMatchObject({ width: 64, height: 64, codec: 'avc1', faststart: false })
    expect(info(fixture('square-faststart.mp4')).durationMs).toBeGreaterThanOrEqual(900)
    expect(info(fixture('square-faststart.mp4')).durationMs).toBeLessThanOrEqual(1100)
  })
})

describe('probeMp4 - refusing what is not a usable MP4', () => {
  it.each([
    ['empty input', new Uint8Array(0)],
    ['fewer than 8 bytes', new Uint8Array([0, 0, 0, 8, 102, 116])],
    ['a first box that is not ftyp', box('moov', new Uint8Array(4))],
    ['a PNG', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])],
  ])('calls %s not an MP4', (_label, bytes) => {
    expect(reason(bytes)).toBe('not_mp4')
  })

  it('refuses unusable durations', () => {
    expect(reason(mp4({ timescale: 0 }))).toBe('bad_duration')
    expect(reason(mp4({ duration: 0 }))).toBe('bad_duration')
    expect(reason(mp4({ duration: 0xffffffff }))).toBe('bad_duration')
    expect(reason(mp4({ mvhdVersion: 1, duration: 0xffffffffffffffffn }))).toBe('bad_duration')
  })

  it('says when there is no moov, or no video track in it', () => {
    expect(reason(new Uint8Array([...box('ftyp', new Uint8Array(8)), ...box('mdat', new Uint8Array(4))]))).toBe('no_moov')
    const audioOnly = mp4({ audioTrackFirst: true, codec: 'avc1' })
    // Turn the video track's handler into a second audio handler.
    const copy = new Uint8Array(audioOnly)
    const text = new TextDecoder('latin1').decode(copy)
    const at = text.lastIndexOf('vide')
    copy.set(new TextEncoder().encode('soun'), at)
    expect(reason(copy)).toBe('no_video_track')
  })

  it('refuses fragmented files', () => {
    expect(reason(mp4({ fragmented: true }))).toBe('fragmented')
    expect(reason(new Uint8Array([...mp4(), ...box('moof', new Uint8Array(8))]))).toBe('fragmented')
  })

  it('calls broken structure truncated rather than throwing', () => {
    const good = mp4()
    expect(reason(good.slice(0, good.length - 5))).toBe('truncated')
    const tiny = new Uint8Array(good)
    // moov's size field (right after the 24-byte ftyp) set below a header.
    new DataView(tiny.buffer).setUint32(24, 4)
    expect(reason(tiny)).toBe('truncated')
    const overlong = new Uint8Array(good)
    new DataView(overlong.buffer).setUint32(24, 0x7fffffff)
    expect(reason(overlong)).toBe('truncated')
  })

  it('never throws on randomly damaged input, and never changes it', () => {
    const base = fixture('square-faststart.mp4')
    let seed = 42
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    for (let i = 0; i < 500; i++) {
      const copy = new Uint8Array(base)
      for (let f = 0; f < 4; f++) copy[Math.floor(rand() * copy.length)] = Math.floor(rand() * 256)
      const cut = rand() < 0.3 ? copy.slice(0, Math.floor(rand() * copy.length)) : copy
      const before = cut.slice()
      expect(() => probeMp4(cut)).not.toThrow()
      expect(cut).toEqual(before)
    }
  })
})
