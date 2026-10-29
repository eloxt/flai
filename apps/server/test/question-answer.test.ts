import { modelConfigSchema } from '@flai/shared'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv, UserRow } from '../src/lib/hono'
import { AppError } from '../src/lib/errors'
import * as schema from '../src/db/schema'
import type { MessageRow } from '../src/services/conversations'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), select: vi.fn(), update: vi.fn(), child: vi.fn(), conversation: vi.fn(),
  existing: vi.fn(), active: vi.fn(), info: vi.fn(), start: vi.fn(), path: vi.fn(), resolve: vi.fn(),
}))
vi.mock('../src/db', async () => ({
  schema: await import('../src/db/schema'),
  db: { transaction: mocks.transaction, query: { conversations: { findFirst: mocks.conversation }, messages: { findFirst: mocks.existing } } },
}))
vi.mock('../src/llm/generation', () => ({ startGeneration: mocks.start, cancelGeneration: vi.fn() }))
vi.mock('../src/llm/stream-bus', () => ({ generationBus: () => ({ active: mocks.active, info: mocks.info }), isStreamPosition: vi.fn() }))
vi.mock('../src/services/providers', () => ({ resolveModel: mocks.resolve }))
vi.mock('../src/services/files', () => ({ ownedFiles: vi.fn() }))
vi.mock('../src/services/conversations', async (original) => ({
  ...await original<typeof import('../src/services/conversations')>(), loadPath: mocks.path, touchConversation: vi.fn(),
}))

import { messageRoutes } from '../src/routes/messages'

let message: MessageRow
const nextId = '10000000-0000-4000-8000-000000000001'
const app = new Hono<AppEnv>()
  .use('*', async (c, next) => {
    c.set('user', { id: c.req.header('x-test-user') ?? 'alice', role: 'user', preferences: {} } as UserRow)
    await next()
  })
  .route('/', messageRoutes)
  .onError((error, c) => c.json({ error: error.message }, error instanceof AppError ? error.status : 500))

const answer = (value: unknown, toolCallId = 'q1', user = 'alice') => app.request('/conversations/c1/messages/a1/answer', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': user },
  body: JSON.stringify({ assistantId: nextId, toolCallId, answer: value }),
})

beforeEach(() => {
  vi.resetAllMocks()
  message = {
    id: 'a1', conversationId: 'c1', parentId: 'u1', role: 'assistant',
    parts: [{ type: 'tool-ask_user', toolCallId: 'q1', state: 'input-available', input: { question: 'Which language?' } }],
    metadata: { providerId: 'original-provider', modelId: 'original-model', chatOptions: { thinking: 'low', webSearch: true, urlContext: false, mcpTools: [] } },
    createdAt: new Date(), deletedAt: null, tsv: null, searchText: '',
  }
  mocks.conversation.mockResolvedValue({ id: 'c1', userId: 'alice' })
  mocks.select.mockImplementation(() => ({ from: (table: unknown) => ({ where: () => ({
    for: async () => table === schema.conversations ? [{ id: 'c1' }] : [message],
  }) }) }))
  mocks.update.mockReturnValue({ set: ({ parts }: Pick<MessageRow, 'parts'>) => ({ where: () => ({ returning: async () => {
    message = { ...message, parts }
    return [message]
  } }) }) })
  mocks.transaction.mockImplementation(async (callback) => callback({
    select: mocks.select, update: mocks.update, query: { messages: { findFirst: mocks.child } },
  }))
  mocks.path.mockImplementation(async () => [message])
  mocks.resolve.mockReturnValue({
    provider: { id: 'original-provider' },
    model: modelConfigSchema.parse({ id: 'original-model', toolCall: true, thinkingLevels: ['low'] }),
  })
})

describe('answering a question', () => {
  it('saves a tool result and continues with the original model and settings', async () => {
    const response = await answer('English')
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.message.parts[0]).toMatchObject({ state: 'output-available', output: { answer: 'English', content: 'User answered: English', isError: false } })
    expect(result.generation).toEqual({ assistantId: nextId, parentId: 'a1' })
    expect(mocks.resolve).toHaveBeenCalledWith('original-provider', 'original-model', { user: true })
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
      assistantId: nextId, user: expect.objectContaining({ id: 'alice' }), path: [message], options: message.metadata.chatOptions,
    }))
  })

  it('accepts long provider-generated tool call IDs without truncating them', async () => {
    const toolCallId = `call_${'a'.repeat(4096)}`
    message.parts = [{
      type: 'tool-ask_user', toolCallId, state: 'input-available', input: { question: 'Which language?' },
    }]
    const response = await answer('English', toolCallId)
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.message.parts[0]).toMatchObject({
      toolCallId, state: 'output-available', output: { answer: 'English' },
    })
    expect(mocks.start).toHaveBeenCalledOnce()
  })

  it('waits for every question before continuing, including multi-select answers', async () => {
    message.parts.push({ type: 'dynamic-tool', toolName: 'ask_user', toolCallId: 'q2', state: 'input-available', input: {
      question: 'Which features?', options: [{ label: 'Search' }, { label: 'Files' }], selectionMode: 'multi_select',
    } })
    expect((await (await answer('English')).json()).generation).toBeNull()
    expect(mocks.start).not.toHaveBeenCalled()
    const response = await answer(['Search', 'Files'], 'q2')
    expect(response.status).toBe(200)
    expect(message.parts[1]).toMatchObject({ state: 'output-available', output: { answer: ['Search', 'Files'], content: 'User answered: Search, Files' } })
    expect(mocks.start).toHaveBeenCalledOnce()
  })

  it('rejects duplicate answers without overwriting the saved result', async () => {
    expect((await answer('English')).status).toBe(200)
    expect((await answer('中文')).status).toBe(409)
    expect(message.parts[0]).toMatchObject({ output: { answer: 'English' } })
    expect(mocks.start).toHaveBeenCalledOnce()
  })

  it.each(['', '   ', [], ['English', 'English']])('rejects empty or duplicate answers: %j', async (value) => {
    expect((await answer(value)).status).toBe(422)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('rejects answers from another user', async () => {
    expect((await answer('English', 'q1', 'bob')).status).toBe(404)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects an answer of the wrong selection mode', async () => {
    expect((await answer(['English'])).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects stale questions and answers while a reply is running', async () => {
    mocks.active.mockResolvedValue({ assistantId: 'active' })
    expect((await answer('English')).status).toBe(409)
    mocks.active.mockResolvedValue(null)
    mocks.child.mockResolvedValue({ id: 'child' })
    expect((await answer('English')).status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
