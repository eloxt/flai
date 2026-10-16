import { noopObserve } from '@mastra/core/tools'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebFetchTool, webFetchInputSchema } from '../src/llm/web-fetch'

const fetchMock = vi.fn<typeof fetch>()
const fetchPages = createWebFetchTool('exa-test-key')
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async () => Response.json({ results: [] }))
})
afterEach(() => vi.unstubAllGlobals())

describe('Exa web_fetch', () => {
  it('requests highlights and fixed extras from /contents using the admin key', async () => {
    await fetchPages.execute!({ urls: ['https://example.com/article', 'https://example.com/report.pdf'] }, { observe: noopObserve })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.exa.ai/contents')
    expect(new Headers(init?.headers).get('x-api-key')).toBe('exa-test-key')
    expect(JSON.parse(init!.body as string)).toEqual({
      urls: ['https://example.com/article', 'https://example.com/report.pdf'], highlights: true, extras: { links: 3, imageLinks: 3 },
    })
    expect(Object.keys(webFetchInputSchema.shape)).toEqual(['urls'])
  })

  it('preserves partial successes, per-URL failures, metadata and costs', async () => {
    const response = {
      requestId: 'contents-1',
      results: [{ url: 'https://example.com/article', title: 'Article', text: 'Full page text', author: 'Author', extras: { links: ['https://example.com/more'], imageLinks: ['https://example.com/image.jpg'] } }],
      statuses: [
        { id: 'https://example.com/article', status: 'success', source: 'cached' },
        { id: 'https://example.com/missing', status: 'error', error: { tag: 'CRAWL_NOT_FOUND', httpStatusCode: 404 } },
      ],
      costDollars: { total: 0.002 },
    }
    fetchMock.mockResolvedValue(Response.json(response))
    expect(await fetchPages.execute!({ urls: ['https://example.com/article', 'https://example.com/missing'] }, { observe: noopObserve })).toEqual(response)
  })

  it('keeps per-URL failure details when no pages succeed', async () => {
    const response = { results: [], statuses: [{ id: 'https://example.com', status: 'error', error: { tag: 'CRAWL_TIMEOUT', httpStatusCode: null } }] }
    fetchMock.mockResolvedValue(Response.json(response))
    expect(await fetchPages.execute!({ urls: ['https://example.com'] }, { observe: noopObserve })).toEqual(response)
  })

  it.each([
    { urls: [] }, { urls: ['not-a-url'] }, { urls: ['file:///etc/passwd'] }, { urls: ['ftp://example.com/file'] },
    { urls: Array.from({ length: 101 }, (_, i) => `https://example.com/${i}`) },
    { urls: [`https://example.com/${'x'.repeat(2048)}`] },
  ])('rejects invalid URL batches: %j', (input) => {
    expect(webFetchInputSchema.safeParse(input).success).toBe(false)
  })

  it.each([401, 402, 429, 503])('reports HTTP %i without exposing upstream response bodies', async (status) => {
    fetchMock.mockResolvedValue(new Response('secret upstream body exa-test-key', { status }))
    await expect(fetchPages.execute!({ urls: ['https://example.com'] }, { observe: noopObserve })).rejects.toThrow(`HTTP ${status}`)
  })

  it('requires a configured key before making a request', async () => {
    await expect(createWebFetchTool('').execute!({ urls: ['https://example.com'] }, { observe: noopObserve })).rejects.toThrow('Exa API key is not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed responses', async () => {
    fetchMock.mockResolvedValue(Response.json({ unexpected: true }))
    await expect(fetchPages.execute!({ urls: ['https://example.com'] }, { observe: noopObserve })).rejects.toThrow('invalid fetch response')
  })

  it('aborts the request when generation is cancelled', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      await new Promise<void>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
      return Response.json({ results: [] })
    })
    const controller = new AbortController()
    const pending = fetchPages.execute!({ urls: ['https://example.com'] }, { observe: noopObserve, abortSignal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    controller.abort()
    await expect(pending).rejects.toThrow('Web fetch cancelled')
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true)
  })
})
