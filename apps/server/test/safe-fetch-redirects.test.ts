import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<typeof import('undici')>(),
  fetch: vi.fn(),
}))
import { fetch } from 'undici'
import { safeFetch } from '../src/llm/safe-fetch'

const fetchMock = vi.mocked(fetch)
beforeEach(() => vi.resetAllMocks())

describe('safe image redirects', () => {
  it('preserves the default same-origin redirect restriction', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://cdn.example/image.jpg' } }) as never)
    await expect(safeFetch('https://images.example/photo')).rejects.toThrow('Cross-origin')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('allows CDN redirects explicitly and strips sensitive headers', async () => {
    const cancel = vi.fn()
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), {
      status: 302, headers: { location: 'https://cdn.example/image.jpg' },
    }) as never).mockResolvedValueOnce(new Response('image') as never)
    const response = await safeFetch('https://images.example/photo', {
      headers: { authorization: 'secret', cookie: 'session=secret', referer: 'https://app.example', accept: 'image/png' },
    }, { allowCrossOriginRedirects: true })
    expect(await response.text()).toBe('image')
    expect(cancel).toHaveBeenCalledOnce()
    expect(new Headers(fetchMock.mock.calls[1]![1]!.headers as HeadersInit).get('accept')).toBe('image/png')
    expect([...new Headers(fetchMock.mock.calls[1]![1]!.headers as HeadersInit).keys()]).toEqual(['accept'])
    expect(fetchMock.mock.calls[1]![1]!.dispatcher).toBeDefined()
  })

  it.each(['http://127.0.0.1/secret', 'http://[::1]/', 'http://169.254.169.254/', 'file:///etc/passwd', 'https://user:pw@cdn.example/image.jpg'])('validates redirect target %s before connecting', async (target) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: target } }) as never)
    await expect(safeFetch('https://images.example/photo', undefined, { allowCrossOriginRedirects: true })).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('bounds cross-origin redirect loops', async () => {
    fetchMock.mockImplementation(async (url) => new Response(null, {
      status: 302, headers: { location: String(url).includes('images.example') ? 'https://cdn.example/image' : 'https://images.example/image' },
    }) as never)
    await expect(safeFetch('https://images.example/photo', undefined, { allowCrossOriginRedirects: true })).rejects.toThrow('excessive')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})
