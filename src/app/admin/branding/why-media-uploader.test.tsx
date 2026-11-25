// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { VideoShape } from '@/lib/why-media'

const api = vi.fn()
const readVideoMeta = vi.fn<(file: File) => Promise<VideoShape>>()
vi.mock('@/lib/api-client', () => ({ api: (...args: unknown[]) => api(...args) }))
vi.mock('./read-video-meta', () => ({ readVideoMeta: (f: File) => readVideoMeta(f) }))

const { WhyMediaUploader } = await import('./why-media-uploader')

const SQUARE: VideoShape = { durationMs: 12_000, width: 1080, height: 1080 }
const mp4File = (bytes = 1024) => new File([new Uint8Array(bytes)], 'why.mp4', { type: 'video/mp4' })
const pngFile = () => new File([new Uint8Array(64)], 'why.png', { type: 'image/png' })

function pick(file: File) {
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
}

beforeEach(() => {
  api.mockReset()
  readVideoMeta.mockReset()
  readVideoMeta.mockResolvedValue(SQUARE)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WhyMediaUploader - choosing a file', () => {
  it('refuses a type it cannot show, without reading it', async () => {
    render(<WhyMediaUploader initial={null} />)
    pick(new File([new Uint8Array(8)], 'why.mov', { type: 'video/quicktime' }))
    expect(await screen.findByText('Use JPG, PNG, WEBP, or MP4.')).toBeTruthy()
    expect(readVideoMeta).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
  })

  it('refuses a video over 6 MB before reading it', async () => {
    render(<WhyMediaUploader initial={null} />)
    pick(mp4File(6 * 1024 * 1024 + 1))
    expect(await screen.findByText('Video over 6 MB.')).toBeTruthy()
    expect(readVideoMeta).not.toHaveBeenCalled()
  })

  it.each<[string, VideoShape, string]>([
    ['too long', { ...SQUARE, durationMs: 21_000 }, 'Video longer than 20 seconds.'],
    ['not square', { ...SQUARE, height: 1920 }, 'Video must be square (1:1).'],
  ])('refuses a video that is %s, with no Upload button', async (_label, shape, message) => {
    readVideoMeta.mockResolvedValue(shape)
    render(<WhyMediaUploader initial={null} />)
    pick(mp4File())
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
  })

  it('says so when the browser cannot read the video', async () => {
    readVideoMeta.mockRejectedValue(new Error('unreadable'))
    render(<WhyMediaUploader initial={null} />)
    pick(mp4File())
    expect(await screen.findByText('Could not read this video. Use an H.264 MP4.')).toBeTruthy()
  })
})

describe('WhyMediaUploader - picking again', () => {
  it('keeps the last pick when an earlier, slower video check finishes after it', async () => {
    let finishA: (shape: VideoShape) => void = () => {}
    readVideoMeta.mockImplementationOnce(() => new Promise((resolve) => (finishA = resolve)))
    api.mockResolvedValue({ ok: true, status: 200, data: { url: 'https://cdn.example/site/why-b.webp', kind: 'image' } })
    render(<WhyMediaUploader initial={null} />)
    pick(mp4File())
    pick(new File([new Uint8Array(64)], 'b.png', { type: 'image/png' }))
    await screen.findByRole('button', { name: 'Upload' })
    finishA(SQUARE)
    await new Promise((r) => setTimeout(r, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    await waitFor(() => expect(api).toHaveBeenCalled())
    const form = (api.mock.calls[0] as [string, RequestInit])[1].body as FormData
    expect((form.get('image') as File).name).toBe('b.png')
  })

  it('locks the file picker and Cancel while an upload runs', async () => {
    let finish: (v: unknown) => void = () => {}
    api.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    render(<WhyMediaUploader initial={null} />)
    pick(pngFile())
    fireEvent.click(await screen.findByRole('button', { name: 'Upload' }))
    await waitFor(() => expect((document.querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(true))
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    finish({ ok: true, status: 200, data: { url: 'https://cdn.example/site/why-a.webp', kind: 'image' } })
    await waitFor(() => expect((document.querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(false))
  })
})

describe('WhyMediaUploader - uploading', () => {
  it('previews a good video and uploads it in the image field', async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: { url: 'https://cdn.example/site/why-a.mp4', kind: 'video', faststart: true } })
    render(<WhyMediaUploader initial={null} />)
    pick(mp4File())
    fireEvent.click(await screen.findByRole('button', { name: 'Upload' }))
    await waitFor(() => expect(api).toHaveBeenCalled())
    const [path, init] = api.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/v1/admin/site/why-image')
    expect(init.method).toBe('POST')
    expect((init.body as FormData).get('image')).toBeInstanceOf(File)
    await waitFor(() => expect(document.querySelector('video')?.getAttribute('src')).toBe('https://cdn.example/site/why-a.mp4'))
  })

  it('shows the local preview before uploading', async () => {
    render(<WhyMediaUploader initial={null} />)
    pick(mp4File())
    await screen.findByRole('button', { name: 'Upload' })
    expect(document.querySelector('video')?.getAttribute('src')).toBe('blob:preview')
  })

  it("shows the server's refusal word for word", async () => {
    api.mockResolvedValue({ ok: false, status: 415, error: { message: 'Video must be H.264 MP4.' } })
    render(<WhyMediaUploader initial={null} />)
    pick(mp4File())
    fireEvent.click(await screen.findByRole('button', { name: 'Upload' }))
    expect(await screen.findByText('Video must be H.264 MP4.')).toBeTruthy()
  })

  it('hints, without blocking, when the video will start slowly', async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: { url: 'https://cdn.example/site/why-a.mp4', kind: 'video', faststart: false } })
    render(<WhyMediaUploader initial={null} />)
    pick(mp4File())
    fireEvent.click(await screen.findByRole('button', { name: 'Upload' }))
    expect(await screen.findByText(/fast start/i)).toBeTruthy()
  })

  it('still takes a photo the way it always did', async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: { url: 'https://cdn.example/site/why-a.webp', kind: 'image' } })
    render(<WhyMediaUploader initial={null} />)
    pick(pngFile())
    fireEvent.click(await screen.findByRole('button', { name: 'Upload' }))
    await waitFor(() => expect(document.querySelector('img')?.getAttribute('src')).toContain('why-a.webp'))
    expect(readVideoMeta).not.toHaveBeenCalled()
    expect(document.querySelector('video')).toBeNull()
  })

  it('removes the current video', async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: { ok: true } })
    render(<WhyMediaUploader initial={{ kind: 'video', url: 'https://cdn.example/site/why-a.mp4' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('No photo or video set')).toBeTruthy()
    expect(api).toHaveBeenCalledWith('/api/v1/admin/site/why-image', { method: 'DELETE' })
  })
})
