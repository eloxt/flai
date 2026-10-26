import { noopObserve } from '@mastra/core/tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ conversation: vi.fn(), leaf: vi.fn(), path: vi.fn() }))

vi.mock('../src/db', async () => ({
  schema: await import('../src/db/schema'),
  db: {
    query: { conversations: { findFirst: mocks.conversation } },
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: mocks.leaf }) }) }) }),
  },
}))
vi.mock('../src/services/conversations', () => ({ loadPath: mocks.path }))

import { createChatHistoryTools } from '../src/llm/chat-history'

const tools = createChatHistoryTools({ userId: 'alice', conversationId: 'current' })
const read = (id: string) => tools.read_chat.execute!({ id }, { observe: noopObserve }) as Promise<any>
const row = (role: string, searchText: string) => ({ role, searchText })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.conversation.mockResolvedValue({ id: 'past', title: 'Trip', updatedAt: new Date('2026-10-01T08:00:00Z') })
  mocks.leaf.mockResolvedValue([{ id: 'a2' }])
})

describe('read_chat tool', () => {
  it('never reads the current conversation', async () => {
    expect(await read('current')).toEqual({ error: 'Chat not found' })
    expect(mocks.conversation).not.toHaveBeenCalled()
  })

  it('reports chats the user does not own as not found', async () => {
    mocks.conversation.mockResolvedValue(undefined)
    expect(await read('foreign')).toEqual({ error: 'Chat not found' })
  })

  it('returns the latest branch as text, skipping messages without any', async () => {
    mocks.path.mockResolvedValue([row('user', 'Plan a trip to Kyoto'), row('assistant', ''), row('assistant', 'Here is a plan')])
    expect(await read(' past ')).toEqual({
      title: 'Trip', date: '2026-10-01',
      messages: [{ role: 'user', text: 'Plan a trip to Kyoto' }, { role: 'assistant', text: 'Here is a plan' }],
    })
    expect(mocks.path).toHaveBeenCalledWith('past', 'a2')
  })

  it('keeps the most recent turns of a long chat', async () => {
    mocks.path.mockResolvedValue([row('user', 'old'), row('assistant', 'x'.repeat(11_999)), row('user', 'new question')])
    const result = await read('past')
    expect(result.truncated).toBe(true)
    expect(result.messages.map((m: any) => m.role)).toEqual(['assistant', 'user'])
    expect(result.messages[0].text).toBe(`…${'x'.repeat(11_988)}`)
    expect(result.messages[1].text).toBe('new question')
  })
})
