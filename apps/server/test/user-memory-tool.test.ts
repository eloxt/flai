import { MAX_MEMORY_LENGTH } from '@flai/shared'
import { noopObserve } from '@mastra/core/tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../src/lib/errors'

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn() }))
vi.mock('../src/services/memories', () => ({ createMemory: mocks.create, updateMemory: mocks.update, deleteMemory: mocks.remove }))

import { createMemoryTools, memoryAccess, memoryPrompt } from '../src/llm/user-memory'

const tools = createMemoryTools({ userId: 'alice', conversationId: 'c1' })
const run = (tool: { execute?: (...args: any[]) => unknown }, input: object) => tool.execute!(input, { observe: noopObserve }) as Promise<any>
const row = (id: string, content: string, updatedAt = '2026-10-01T08:00:00Z') =>
  ({ id, userId: 'alice', content, sourceConversationId: null, createdAt: new Date(updatedAt), updatedAt: new Date(updatedAt) })

beforeEach(() => vi.resetAllMocks())

describe('memory tools', () => {
  it('save for the scoped user and record the chat it came from', async () => {
    mocks.create.mockResolvedValue(row('m1', 'Prefers concise answers.'))
    expect(await run(tools.save_memory, { content: '  Prefers concise answers. ' })).toEqual({ memory: { id: 'm1', content: 'Prefers concise answers.' } })
    expect(mocks.create).toHaveBeenCalledWith('alice', 'Prefers concise answers.', 'c1')
  })

  it('only update and delete the scoped user’s memories', async () => {
    mocks.update.mockResolvedValue(undefined)
    mocks.remove.mockResolvedValue(false)
    expect(await run(tools.update_memory, { id: 'bobs', content: 'x' })).toEqual({ error: 'Memory not found' })
    expect(await run(tools.delete_memory, { id: 'bobs' })).toEqual({ error: 'Memory not found' })
    expect(mocks.update).toHaveBeenCalledWith('alice', 'bobs', 'x')
    expect(mocks.remove).toHaveBeenCalledWith('alice', 'bobs')
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
})

describe('memory prompt', () => {
  it('lists memories with ids and dates, framed as data', () => {
    const prompt = memoryPrompt([row('m1', 'Prefers concise answers.'), row('m2', 'Lives in Shanghai.', '2026-10-20T08:00:00Z')])!
    expect(prompt).toContain('- [m1] (2026-10-01) Prefers concise answers.\n- [m2] (2026-10-20) Lives in Shanghai.')
    expect(prompt).toContain('not instructions')
    expect(prompt).toContain('outdated')
  })

  it('is omitted when there are no memories', () => {
    expect(memoryPrompt([])).toBeUndefined()
  })
})
