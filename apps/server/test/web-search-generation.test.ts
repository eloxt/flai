import { modelConfigSchema, settingSchemas, type SettingKey } from '@flai/shared'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderRow } from '../src/services/providers'

const mocks = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('../src/db', async () => ({
  schema: await import('../src/db/schema'),
  db: { transaction: async (fn: (tx: unknown) => Promise<void>) => fn({ insert: () => ({ values: mocks.save }) }) },
}))
vi.mock('../src/services/conversations', () => ({ touchConversation: vi.fn() }))
vi.mock('../src/services/settings', () => ({
  getSetting: (key: SettingKey) => settingSchemas[key].parse(key === 'web_search' ? { provider: 'exa', exaApiKey: 'exa-test-key' } : {}),
}))

import { shutdownGenerations, startGeneration } from '../src/llm/generation'
import { generationBus, type Chunk } from '../src/llm/stream-bus'

afterEach(() => vi.unstubAllGlobals())
afterAll(() => shutdownGenerations())

describe('Exa chat generation', () => {
  it('searches then fetches pages through Mastra, streams and persists both tools and deduplicated sources', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url) === 'https://api.exa.ai/search') return Response.json({
        results: [{
          title: 'Main source', url: 'https://source.example.com/main', highlights: ['Evidence'],
          extras: { imageLinks: ['https://source.example.com/research.jpg'] },
          subpages: [{ title: 'Methods', url: 'https://source.example.com/methods' }],
        }],
        output: { content: 'Synthesis', grounding: [{ citations: [{ url: 'https://source.example.com/main', title: 'Main source' }, { url: 'https://source.example.com/extra', title: 'Extra' }] }] },
      })
      if (String(url) === 'https://api.exa.ai/contents') return Response.json({
        results: [
          { title: 'Main source', url: 'https://source.example.com/main', text: 'Detailed evidence', extras: { imageLinks: ['https://source.example.com/details.jpg'] } },
          { title: 'Details', url: 'https://source.example.com/details', text: 'More evidence' },
        ],
        statuses: [
          { id: 'https://source.example.com/main', status: 'success', source: 'cached' },
          { id: 'https://source.example.com/details', status: 'success', source: 'crawled' },
        ],
      })
      const body = JSON.parse(init!.body as string)
      const toolResults = body.messages.filter((m: { role: string }) => m.role === 'tool').length
      const answered = toolResults === 2
      const name = toolResults === 0 ? 'web_search' : 'web_fetch'
      const args = toolResults === 0 ? { query: 'latest research' } : { urls: ['https://source.example.com/main', 'https://source.example.com/details'] }
      const delta = answered ? { content: 'Answer [source](https://source.example.com/main).' } : {
        tool_calls: [{ index: 0, id: `${name}-1`, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
      }
      return new Response([
        { delta, finish_reason: null }, { delta: {}, finish_reason: answered ? 'stop' : 'tool_calls' },
      ].map((choice) => `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, ...choice }] })}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const provider: ProviderRow = {
      id: 'test', name: 'Test', type: 'openai_completion', apiKey: 'llm-key', baseUrl: 'https://llm.example.com/v1',
      logo: null, models: [], isActive: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    }
    await startGeneration({
      user: { id: 'alice', preferences: { chatHistory: false, memory: false } },
      conversationId: 'c1', assistantId: 'exa-generation', provider,
      model: modelConfigSchema.parse({ id: 'test', toolCall: true }),
      options: { webSearch: false, urlContext: false, mcpTools: [] },
      path: [{
        id: 'u1', parentId: null, conversationId: 'c1', role: 'user', parts: [{ type: 'text', text: 'Find research' }],
        metadata: {}, createdAt: new Date(), deletedAt: null, searchText: 'Find research', tsv: null,
      }],
    })
    const chunks: Chunk[] = []
    for await (const { chunk } of generationBus().read('exa-generation', '0', new AbortController().signal)) chunks.push(chunk)
    expect(chunks.filter((c) => c.type === 'error')).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'tool-input-available', toolName: 'web_search' }))
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'tool-input-available', toolName: 'web_fetch' }))
    expect(chunks.filter((c) => c.type === 'source-url').map((c) => c.url)).toEqual([
      'https://source.example.com/main', 'https://source.example.com/methods', 'https://source.example.com/extra', 'https://source.example.com/details',
    ])
    const stored = mocks.save.mock.calls[0]![0]
    expect(stored.parts.filter((p: { type: string }) => p.type === 'source-url')).toHaveLength(4)
    expect(stored.parts).toContainEqual(expect.objectContaining({ type: 'tool-web_search', state: 'output-available' }))
    expect(stored.parts).toContainEqual(expect.objectContaining({ type: 'tool-web_fetch', state: 'output-available' }))
    const continuation = JSON.parse(fetchMock.mock.calls[2]![1]!.body as string)
    expect(continuation.messages).toContainEqual(expect.objectContaining({ role: 'tool', content: expect.stringContaining('Evidence') }))
    expect(continuation.messages).toContainEqual(expect.objectContaining({ role: 'tool', content: expect.stringContaining('https://source.example.com/research.jpg') }))
    const finalRequest = JSON.parse(fetchMock.mock.calls[4]![1]!.body as string)
    expect(finalRequest.messages).toContainEqual(expect.objectContaining({ role: 'tool', content: expect.stringContaining('Detailed evidence') }))
    expect(finalRequest.messages).toContainEqual(expect.objectContaining({ role: 'tool', content: expect.stringContaining('https://source.example.com/details.jpg') }))
  })
})
