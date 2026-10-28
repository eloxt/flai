import { modelConfigSchema, settingSchemas, type SettingKey } from '@flai/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemoryAccess } from '../src/llm/user-memory'
import type { ProviderRow } from '../src/services/providers'

const mocks = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('../src/db', async () => ({
  schema: await import('../src/db/schema'),
  db: { transaction: async (fn: (tx: unknown) => Promise<void>) => fn({ insert: () => ({ values: vi.fn() }) }) },
}))
vi.mock('../src/services/conversations', () => ({ touchConversation: vi.fn() }))
vi.mock('../src/services/memories', () => ({ listMemories: mocks.list }))
vi.mock('../src/services/settings', () => ({ getSetting: (key: SettingKey) => settingSchemas[key].parse({}) }))

import { shutdownGenerations, startGeneration } from '../src/llm/generation'
import { generationBus } from '../src/llm/stream-bus'

const provider: ProviderRow = {
  id: 'test', name: 'Test', type: 'openai_completion', apiKey: 'llm-key', baseUrl: 'https://llm.example.com/v1',
  logo: null, models: [], isActive: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
}

let n = 0
/** Generate one reply and return the request the model received. */
async function request(memory: MemoryAccess) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response([
    { delta: { content: 'ok' }, finish_reason: null }, { delta: {}, finish_reason: 'stop' },
  ].map((choice) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, ...choice }] })}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }))
  vi.stubGlobal('fetch', fetchMock)
  const assistantId = `memory-${n++}`
  await startGeneration({
    userId: 'alice', conversationId: 'c1', assistantId, provider,
    model: modelConfigSchema.parse({ id: 'test', toolCall: true }),
    options: { webSearch: false, urlContext: false, mcpTools: [] },
    chatHistory: false,
    memory,
    path: [{
      id: 'u1', parentId: null, conversationId: 'c1', role: 'user', parts: [{ type: 'text', text: 'Hi' }],
      metadata: {}, createdAt: new Date(), deletedAt: null, searchText: 'Hi', tsv: null,
    }],
  })
  for await (const _ of generationBus().read(assistantId, '0', new AbortController().signal));
  const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
  return {
    system: body.messages.find((m: { role: string }) => m.role === 'system')?.content as string,
    tools: (body.tools ?? []).map((t: { function: { name: string } }) => t.function.name) as string[],
  }
}

beforeEach(() => {
  mocks.list.mockReset()
  mocks.list.mockResolvedValue([{ id: 'm1', content: 'Prefers concise answers.', updatedAt: new Date('2026-10-01T08:00:00Z') }])
})
afterEach(() => vi.unstubAllGlobals())
afterAll(() => shutdownGenerations())

describe('memory in chat generation', () => {
  it('gives the model saved memories and the tools to change them', async () => {
    const { system, tools } = await request('write')
    expect(mocks.list).toHaveBeenCalledWith('alice')
    expect(system).toContain('- [m1] (2026-10-01) Prefers concise answers.')
    expect(tools).toEqual(expect.arrayContaining(['save_memory', 'update_memory', 'delete_memory']))
  })

  it('keeps memories read-only when the user turned writing off', async () => {
    const { system, tools } = await request('read')
    expect(system).toContain('Prefers concise answers.')
    expect(system).not.toContain('save_memory')
    expect(tools).not.toContain('save_memory')
    expect(tools).not.toContain('update_memory')
    expect(tools).not.toContain('delete_memory')
  })

  it('neither loads nor offers memory when the user turned it off', async () => {
    const { system, tools } = await request('off')
    expect(mocks.list).not.toHaveBeenCalled()
    expect(system ?? '').not.toContain('user_memories')
    expect(tools).not.toContain('save_memory')
  })
})
