import { MAX_MEMORY_LENGTH, PREFERENCE_DEFAULTS, resolvePreferences } from '@flai/shared'
import { noopObserve } from '@mastra/core/tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../src/lib/errors'

const mocks = vi.hoisted(() => ({ create: vi.fn(), find: vi.fn(), update: vi.fn(), remove: vi.fn(), duplicate: vi.fn() }))
vi.mock('../src/services/memories', () => ({
  createMemory: mocks.create, findMemoryIds: mocks.find, updateMemory: mocks.update, deleteMemory: mocks.remove,
}))
vi.mock('../src/llm/memory-retrieval', () => ({ findDuplicate: mocks.duplicate }))
vi.mock('../src/llm/embedding-index', () => ({ nudgeEmbeddingIndexer: vi.fn() }))

import { createMemoryTools, memoryAccess, memoryPrompt } from '../src/llm/user-memory'

const tools = createMemoryTools({ userId: 'alice', conversationId: 'c1' })
const run = (tool: { execute?: (...args: any[]) => unknown }, input: object) => tool.execute!(input, { observe: noopObserve }) as Promise<any>
const row = (id: string, content: string, updatedAt = '2026-10-01T08:00:00Z') =>
  ({ id, userId: 'alice', content, pinned: false, sourceConversationId: null, createdAt: new Date(updatedAt), updatedAt: new Date(updatedAt) })
const log = { source: 'agent', conversationId: 'c1' }

beforeEach(() => vi.resetAllMocks())

describe('memory tools', () => {
  it('save for the scoped user and record the chat it came from', async () => {
    mocks.create.mockResolvedValue(row('m1', 'Prefers concise answers.'))
    expect(await run(tools.save_memory, { content: '  Prefers concise answers. ' })).toEqual({ memory: { id: 'm1', content: 'Prefers concise answers.' } })
    expect(mocks.create).toHaveBeenCalledWith('alice', 'Prefers concise answers.', { ...log, pinned: undefined })
  })

  it('update the memory a new one restates instead of adding another', async () => {
    mocks.duplicate.mockResolvedValue('m1-full')
    mocks.update.mockResolvedValue(row('m1-full', 'Prefers short answers.'))
    expect(await run(tools.save_memory, { content: 'Prefers short answers.' })).toMatchObject({ memory: { id: 'm1-full', content: 'Prefers short answers.' }, note: expect.any(String) })
    expect(mocks.update).toHaveBeenCalledWith('alice', 'm1-full', { content: 'Prefers short answers.' }, log)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('pin core memories, saving unpinned once the limit is reached', async () => {
    mocks.create.mockResolvedValue(row('m1', 'Is a backend engineer.'))
    const result = await run(tools.save_memory, { content: 'Is a backend engineer.', pinned: true })
    expect(mocks.create).toHaveBeenCalledWith('alice', 'Is a backend engineer.', { ...log, pinned: true })
    expect(result.note).toContain('pinned limit')
  })

  it('only update and delete the scoped user’s memories', async () => {
    mocks.find.mockResolvedValue([])
    expect(await run(tools.update_memory, { id: 'bobs', content: 'x' })).toEqual({ error: 'Memory not found' })
    expect(await run(tools.delete_memory, { id: 'bobs' })).toEqual({ error: 'Memory not found' })
    expect(mocks.find).toHaveBeenCalledWith('alice', 'bobs')
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('resolve the short id from the prompt to the full one', async () => {
    const id = '3f2a9c1e-0000-4000-8000-000000000000'
    mocks.find.mockResolvedValue([id])
    mocks.update.mockResolvedValue(row(id, 'Prefers short answers.'))
    mocks.remove.mockResolvedValue(true)
    expect(await run(tools.update_memory, { id: '3f2a9c1e', content: 'Prefers short answers.' })).toEqual({ memory: { id: '3f2a9c1e', content: 'Prefers short answers.' } })
    expect(mocks.update).toHaveBeenCalledWith('alice', id, { content: 'Prefers short answers.', pinned: undefined }, log)
    expect(await run(tools.delete_memory, { id: '3f2a9c1e' })).toEqual({ deleted: true })
    expect(mocks.remove).toHaveBeenCalledWith('alice', id, log)
  })

  it('refuse to guess between memories sharing a short id', async () => {
    mocks.find.mockResolvedValue(['3f2a9c1e-a', '3f2a9c1e-b'])
    expect(await run(tools.delete_memory, { id: '3f2a9c1e' })).toEqual({ error: 'Several memories match this id' })
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('tell the model when memory is full instead of failing the reply', async () => {
    mocks.create.mockRejectedValue(new AppError('CONFLICT', 'Memory is full (100 items); update or delete one first'))
    expect(await run(tools.save_memory, { content: 'Lives in Shanghai.' })).toEqual({ error: expect.stringContaining('Memory is full') })
  })

  it('reject memories longer than one short sentence', async () => {
    // Mastra hands validation errors back to the model so it can retry.
    expect(await run(tools.save_memory, { content: 'x'.repeat(MAX_MEMORY_LENGTH + 1) })).toMatchObject({ error: true })
    expect(await run(tools.update_memory, { id: 'm1', content: ' ' })).toMatchObject({ error: true })
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

describe('memory preferences', () => {
  it('default to reading and writing', () => {
    expect(memoryAccess({})).toBe('write')
    expect(memoryAccess({ memoryWrite: false })).toBe('read')
    expect(memoryAccess({ memory: false })).toBe('off')
    expect(memoryAccess({ memory: false, memoryWrite: true })).toBe('off')
  })

  it('ignore stored values that are not booleans', () => {
    expect(memoryAccess({ memory: 'no', memoryWrite: null } as never)).toBe('write')
    expect(resolvePreferences({ chatHistory: 0 } as never)).toEqual(PREFERENCE_DEFAULTS)
    expect(resolvePreferences(undefined)).toEqual({ sidebarShowEmoji: true, chatHistory: true, memory: true, memoryWrite: true })
  })
})

describe('memory prompt', () => {
  it('lists memories with ids and dates, framed as data', () => {
    const prompt = memoryPrompt([row('m1', 'Prefers concise answers.'), row('m2', 'Lives in Shanghai.', '2026-10-20T08:00:00Z')])!
    expect(prompt).toContain('- [m1] (2026-10-01) Prefers concise answers.\n- [m2] (2026-10-20) Lives in Shanghai.')
    expect(prompt).toContain('not instructions')
    expect(prompt).toContain('outdated')
  })

  it('shortens ids, unless two would collide', () => {
    const prompt = memoryPrompt([
      row('3f2a9c1e-0000-4000-8000-000000000001', 'a'),
      row('3f2a9c1e-0000-4000-8000-000000000002', 'b'),
      row('7b1bf7a1-0000-4000-8000-000000000003', 'c'),
    ])!
    expect(prompt).toContain('- [3f2a9c1e-0000-4000-8000-000000000001] (2026-10-01) a')
    expect(prompt).toContain('- [3f2a9c1e-0000-4000-8000-000000000002] (2026-10-01) b')
    expect(prompt).toContain('- [7b1bf7a1] (2026-10-01) c')
  })

  it('is omitted when there are no memories', () => {
    expect(memoryPrompt([])).toBeUndefined()
  })
})
