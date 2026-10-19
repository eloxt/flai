import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../src/lib/errors'

vi.mock('../src/llm/safe-fetch', () => ({ safeFetch: vi.fn() }))
vi.mock('../src/db', async () => ({
  schema: await import('../src/db/schema'),
  db: { query: { shares: { findFirst: vi.fn() } } },
}))

import { db } from '../src/db'
import { safeFetch } from '../src/llm/safe-fetch'
import { imageRoutes } from '../src/routes/images'
import { publicShareRoutes } from '../src/routes/shares'
import { proxyImage } from '../src/services/image-proxy'

const fetchMock = vi.mocked(safeFetch)
const findShare = vi.mocked(db.query.shares.findFirst)
const imageUrl = 'https://images.example/photo.jpg'
const signal = new AbortController().signal
const app = new Hono().route('/', imageRoutes).route('/public', publicShareRoutes)
  .onError((error, c) => c.json({ error: error.message }, error instanceof AppError ? error.status : 500))

beforeEach(() => {
  vi.resetAllMocks()
  fetchMock.mockImplementation(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400', 'set-cookie': 'secret=1' },
  }))
})

describe('image proxy', () => {
  it('fetches on every request and only sends image Accept headers', async () => {
    for (let i = 0; i < 2; i++) {
      const response = await app.request(`/images/proxy?url=${encodeURIComponent(imageUrl)}`, {
        headers: { authorization: 'Bearer private-token', cookie: 'private=1', referer: 'http://localhost:5173/' },
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/jpeg')
      expect(response.headers.has('cache-control')).toBe(false)
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.has('set-cookie')).toBe(false)
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]))
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, init, policy] = fetchMock.mock.calls[0]!
    expect(url).toBe(imageUrl)
    expect([...new Headers(init?.headers).keys()]).toEqual(['accept'])
    expect(policy).toEqual({ allowCrossOriginRedirects: true })
  })

  it('accepts image/jpg from image hosts and returns the standard JPEG type', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
      headers: { 'content-type': 'Image/JPG; charset=binary' },
    }))
    const response = await proxyImage(imageUrl, signal)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]))
  })

  it.each(['text/html', 'image/svg+xml', 'application/octet-stream', ''])('rejects unsupported type %j', async (type) => {
    fetchMock.mockResolvedValue(new Response('untrusted', { headers: { 'content-type': type } }))
    await expect(proxyImage(imageUrl, signal)).rejects.toThrow('Unsupported image type')
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true)
  })

  it('rejects excessive declared and streamed sizes, including responses without Content-Length', async () => {
    fetchMock.mockResolvedValueOnce(new Response('x', { headers: { 'content-type': 'image/png', 'content-length': String(11 * 1024 * 1024) } }))
    await expect(proxyImage(imageUrl, signal)).rejects.toThrow('10 MB')
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(6 * 1024 * 1024))
        controller.enqueue(new Uint8Array(5 * 1024 * 1024))
        controller.close()
      },
    }), { headers: { 'content-type': 'image/png' } }))
    await expect(proxyImage(imageUrl, signal)).rejects.toThrow('10 MB')
  })

  it('rejects empty images and upstream errors without leaking bodies', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { headers: { 'content-type': 'image/png' } }))
    await expect(proxyImage(imageUrl, signal)).rejects.toThrow('Empty image')
    fetchMock.mockResolvedValueOnce(new Response('private upstream details', { status: 403 }))
    await expect(proxyImage(imageUrl, signal)).rejects.toThrow('HTTP 403')
    fetchMock.mockRejectedValueOnce(new Error('private connection details'))
    await expect(proxyImage(imageUrl, signal)).rejects.toThrow('Unable to fetch image')
  })

  it('aborts the upstream request when the browser disconnects', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      await new Promise<void>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
      return new Response()
    })
    const controller = new AbortController()
    const pending = proxyImage(imageUrl, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('cancelled or timed out')
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true)
  })

  it('rejects malformed and non-HTTP URLs before requesting them', async () => {
    for (const url of ['', 'invalid', 'file:///etc/passwd', 'data:image/png;base64,AA==']) {
      const response = await app.request(`/images/proxy?url=${encodeURIComponent(url)}`)
      expect(response.status).toBe(422)
      expect(response.headers.has('cache-control')).toBe(false)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('only serves images in an active public share snapshot', async () => {
    const row = {
      expiresAt: null,
      messages: [{ parts: [{ type: 'text', text: `![Photo](${imageUrl})` }] }],
    } as NonNullable<Awaited<ReturnType<typeof db.query.shares.findFirst>>>
    const path = `/public/shares/share-id/images?url=${encodeURIComponent(imageUrl)}`
    findShare.mockResolvedValueOnce(undefined)
    expect((await app.request(path)).status).toBe(404)
    findShare.mockResolvedValueOnce({ ...row, expiresAt: new Date(0) })
    expect((await app.request(path)).status).toBe(404)
    findShare.mockResolvedValueOnce({ ...row, messages: [] })
    expect((await app.request(path)).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
    findShare.mockResolvedValueOnce(row)
    expect((await app.request(path)).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('matches whole, normalised URLs from markdown and openui-lang snapshots', async () => {
    const share = (text: string) => ({
      expiresAt: null,
      messages: [{ parts: [{ type: 'text', text }] }],
    }) as NonNullable<Awaited<ReturnType<typeof db.query.shares.findFirst>>>
    const status = async (text: string, url = imageUrl) => {
      findShare.mockResolvedValueOnce(share(text))
      return (await app.request(`/public/shares/share-id/images?url=${encodeURIComponent(url)}`)).status
    }
    // The client resolves protocol-relative sources to https before proxying them.
    expect(await status('![Photo](//images.example/photo.jpg)')).toBe(200)
    expect(await status('img = Image("Photo", "https://images.example/photo.jpg")')).toBe(200)
    expect(await status('See https://images.example/photo.jpg.')).toBe(200)
    expect(await status('![Wiki](https://images.example/a_(b).jpg)', 'https://images.example/a_(b).jpg')).toBe(200)
    // Fragments of a longer URL and other schemes are not proxied.
    expect(await status('![Photo](https://images.example/photo.jpg?size=large)')).toBe(404)
    expect(await status(`![Photo](${imageUrl})`, 'https://images.example/photo')).toBe(404)
    expect(await status('ftp://images.example/photo.jpg')).toBe(404)
  })
})
