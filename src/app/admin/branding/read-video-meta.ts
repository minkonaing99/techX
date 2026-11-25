import type { VideoShape } from '@/lib/why-media'

/*
 * Length and size of a chosen video, read by the browser before upload so the
 * owner hears "too long" at once instead of after a 6 MB upload. The server
 * checks again from the file's own bytes. Not unit tested: jsdom cannot decode
 * media.
 */

const TIMEOUT_MS = 10_000

export function readVideoMeta(file: File): Promise<VideoShape> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement('video')
    const done = () => {
      clearTimeout(timer)
      el.removeAttribute('src')
      el.load()
      URL.revokeObjectURL(url)
    }
    const timer = setTimeout(() => {
      done()
      reject(new Error('Timed out reading the video.'))
    }, TIMEOUT_MS)
    el.preload = 'metadata'
    el.muted = true
    el.onloadedmetadata = () => {
      const shape = { durationMs: Math.round(el.duration * 1000), width: el.videoWidth, height: el.videoHeight }
      done()
      resolve(shape)
    }
    el.onerror = () => {
      done()
      reject(new Error('The browser could not read this video.'))
    }
    el.src = url
  })
}
