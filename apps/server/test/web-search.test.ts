import { noopObserve } from '@mastra/core/tools'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebSearchTool, webSearchInputSchema } from '../src/llm/web-search'

const fetchMock = vi.fn<typeof fetch>()
const search = createWebSearchTool('exa-test-key')
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async () => Response.json({ results: [] }))
})
afterEach(() => vi.unstubAllGlobals())

describe('Exa web_search', () => {
  it('authenticates and requests usable source content by default', async () => {
    await search.execute!({ query: 'latest research' }, { observe: noopObserve })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.exa.ai/search')
    expect(init?.headers).toMatchObject({ 'x-api-key': 'exa-test-key' })
    expect(JSON.parse(init!.body as string)).toEqual({ query: 'latest research', type: 'auto', numResults: 10, contents: { highlights: true, extras: { links: 3, imageLinks: 3 } } })
  })

  it('forwards search options with fixed content extraction and retains rich results', async () => {
    const input = webSearchInputSchema.parse({
      query: 'Compare battery research', type: 'deep-reasoning', numResults: 25,
      additionalQueries: ['solid state batteries'], category: 'publication',
    })
    const response = {
      requestId: 'r1', results: [{ url: 'https://nature.com/paper', title: 'Paper', text: 'Evidence', entities: [{ type: 'company' }], subpages: [{ url: 'https://nature.com/methods' }] }],
      output: { content: { conclusion: 'Supported' }, grounding: [{ field: 'conclusion', confidence: 'high', citations: [{ url: 'https://nature.com/paper', title: 'Paper' }] }] },
      notices: [{ code: 'RESTRICTIONS_RELAXED' }], searchTime: 123, costDollars: { total: 0.02 },
    }
    fetchMock.mockResolvedValue(Response.json(response))
    expect(await search.execute!(input, { observe: noopObserve })).toEqual(response)
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ ...input, contents: { highlights: true, extras: { links: 3, imageLinks: 3 } } })
  })

  it('omits removed parameters from the tool schema and the Exa request', async () => {
    const removed = {
      includeDomains: ['example.com'], excludeDomains: ['other.example'],
      startPublishedDate: '2026-01-01T00:00:00Z', endPublishedDate: '2026-10-16T00:00:00Z',
      moderation: true, userLocation: 'SG', compliance: 'hipaa',
      outputSchema: { type: 'text' }, objective: 'Find evidence', userIdentifier: 'user-1', systemPrompt: 'Prefer primary sources',
    }
    for (const name of Object.keys(removed)) expect(webSearchInputSchema.shape).not.toHaveProperty(name)
    await search.execute!({ query: 'test', ...removed }, { observe: noopObserve })
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      query: 'test', type: 'auto', numResults: 10, contents: { highlights: true, extras: { links: 3, imageLinks: 3 } },
    })
  })

  it('hides contents from the tool schema and ignores attempts to override extraction', async () => {
    expect(webSearchInputSchema.shape).not.toHaveProperty('contents')
    const input = { query: 'x', contents: { highlights: false, text: true, extras: { links: 100, imageLinks: 100 } } }
    await search.execute!(input, { observe: noopObserve })
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string).contents).toEqual({
      highlights: true, extras: { links: 3, imageLinks: 3 },
    })
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).has('Exa-Beta')).toBe(false)
  })

  it.each([
    { query: '' }, { query: 'x', numResults: 101 }, { query: 'x', additionalQueries: ['y'] },
  ])('rejects invalid or unsupported combinations: %j', (input) => {
    expect(webSearchInputSchema.safeParse(input).success).toBe(false)
  })

  it.each([400, 401, 402, 403, 429, 500, 503])('reports HTTP %i without exposing upstream bodies or secrets', async (status) => {
    fetchMock.mockResolvedValue(new Response('secret upstream response exa-test-key', { status }))
    await expect(search.execute!({ query: 'x' }, { observe: noopObserve })).rejects.toThrow(`HTTP ${status}`)
  })

  it('removes diagnostic warnings but retains model-facing notices', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      fetchMock.mockResolvedValue(Response.json({ results: [], warnings: [{ code: 'IGNORED_FIELD' }], notices: [{ code: 'RESTRICTIONS_RELAXED' }] }))
      expect(await search.execute!({ query: 'x' }, { observe: noopObserve })).toEqual({ results: [], notices: [{ code: 'RESTRICTIONS_RELAXED' }] })
      expect(warning).toHaveBeenCalledOnce()
    } finally { warning.mockRestore() }
  })

  it('rejects malformed responses', async () => {
    fetchMock.mockResolvedValue(Response.json({ unexpected: true }))
    await expect(search.execute!({ query: 'x' }, { observe: noopObserve })).rejects.toThrow('invalid search response')
  })

  it('cancels the HTTP request with the generation', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      await new Promise<void>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
      return Response.json({ results: [] })
    })
    const controller = new AbortController()
    const pending = search.execute!({ query: 'x' }, { observe: noopObserve, abortSignal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    controller.abort()
    await expect(pending).rejects.toThrow('cancelled')
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true)
  })
})
