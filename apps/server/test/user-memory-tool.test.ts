import { MAX_MEMORY_POINT_LENGTH, PREFERENCE_DEFAULTS, resolvePreferences } from '@flai/shared'
import { noopObserve } from '@mastra/core/tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../src/lib/errors'

const mocks = vi.hoisted(() => ({ create: vi.fn(), find: vi.fn(), get: vi.fn(), update: vi.fn(), remove: vi.fn() }))
vi.mock('../src/services/memories', async (actual) => ({
  ...(await actual<typeof import('../src/services/memories')>()),
  createMemory: mocks.create, findMemoryIds: mocks.find, getMemory: mocks.get, updateMemory: mocks.update, deleteMemory: mocks.remove,
}))
vi.mock('../src/db', async () => ({ schema: await import('../src/db/schema'), db: {} }))
vi.mock('../src/llm/embedding-index', () => ({ nudgeEmbeddingIndexer: vi.fn() }))

import { createMemoryTools, memoryAccess } from '../src/llm/user-memory'

const tools = createMemoryTools({ userId: 'alice', conversationId: 'c1' })
const run = (tool: { execute?: (...args: any[]) => unknown }, input: object) => tool.execute!(input, { observe: noopObserve }) as Promise<any>
const ID = '3f2a9c1e-0000-4000-8000-000000000000'
const row = (points: string[], extra: object = {}) => ({
  id: ID, userId: 'alice', kind: 'topic', title: 'Coffee', summary: 'Drinks', points,
  createdAt: new Date('2026-10-01T08:00:00Z'), updatedAt: new Date('2026-10-01T08:00:00Z'), ...extra,
})
const view = (points: string[]) => ({ id: '3f2a9c1e', kind: 'topic', title: 'Coffee', summary: 'Drinks', points })
const log = { source: 'agent', conversationId: 'c1' }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.find.mockImplementation(async (_user: string, ref: string) => (ID.startsWith(ref) ? [ID] : []))
  mocks.get.mockImplementation(async (_user: string, id: string) => (id === ID ? row(['Likes espresso']) : undefined))
})

describe('memory tools', () => {
  it('start a topic for the scoped user, recording the chat', async () => {
    mocks.create.mockResolvedValue(row(['Prefers concise answers.'], { kind: 'profile', title: 'Profile' }))
    const result = await run(tools.save_memory, { kind: 'profile', title: ' Profile ', summary: 'Who the user is', points: [' Prefers concise answers. '] })
    expect(result.memory).toMatchObject({ id: '3f2a9c1e', title: 'Profile', points: ['Prefers concise answers.'] })
    expect(mocks.create).toHaveBeenCalledWith('alice', { kind: 'profile', title: 'Profile', summary: 'Who the user is', points: ['Prefers concise answers.'] }, log)
  })

  it('add points to a topic by its short id, skipping ones already there', async () => {
    mocks.update.mockResolvedValue(row(['Likes espresso', 'Grinds beans at home']))
    expect(await run(tools.save_memory, { id: '3f2a9c1e', points: ['likes espresso!', 'Grinds beans at home'] }))
      .toEqual({ memory: view(['Likes espresso', 'Grinds beans at home']) })
    expect(mocks.update).toHaveBeenCalledWith('alice', ID, { points: ['Likes espresso', 'Grinds beans at home'], summary: undefined }, log)
  })

  it('need a topic to add to or a title for a new one', async () => {
    expect(await run(tools.save_memory, { points: ['x'] })).toEqual({ error: expect.stringContaining('title') })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('read, update and delete only the scoped user’s topics', async () => {
    expect(await run(tools.read_memory, { id: 'bobs' })).toEqual({ error: 'Memory not found' })
    expect(await run(tools.update_memory, { id: 'bobs', points: ['x'] })).toEqual({ error: 'Memory not found' })
    expect(await run(tools.delete_memory, { id: 'bobs' })).toEqual({ error: 'Memory not found' })
    expect(mocks.find).toHaveBeenCalledWith('alice', 'bobs')
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('read a topic’s points and replace them', async () => {
    expect(await run(tools.read_memory, { id: '3f2a9c1e' })).toEqual({ memory: view(['Likes espresso']) })
    mocks.update.mockResolvedValue(row(['Switched to green tea']))
    expect(await run(tools.update_memory, { id: '3f2a9c1e', points: ['Switched to green tea'] })).toEqual({ memory: view(['Switched to green tea']) })
    expect(mocks.update).toHaveBeenCalledWith('alice', ID, { points: ['Switched to green tea'] }, log)
    mocks.remove.mockResolvedValue(true)
    expect(await run(tools.delete_memory, { id: '3f2a9c1e' })).toEqual({ deleted: true })
    expect(mocks.remove).toHaveBeenCalledWith('alice', ID, log)
  })

  it('refuse to guess between topics sharing a short id', async () => {
    mocks.find.mockResolvedValue(['3f2a9c1e-a', '3f2a9c1e-b'])
    expect(await run(tools.delete_memory, { id: '3f2a9c1e' })).toEqual({ error: 'Several memories match this id' })
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('tell the model when memory is full instead of failing the reply', async () => {
    mocks.create.mockRejectedValue(new AppError('CONFLICT', 'Memory is full (30 topics); merge or delete one first'))
    expect(await run(tools.save_memory, { title: 'Travel', points: ['Lives in Shanghai.'] })).toEqual({ error: expect.stringContaining('Memory is full') })
  })

  it('reject points longer than one short sentence', async () => {
    // Mastra hands validation errors back to the model so it can retry.
    expect(await run(tools.save_memory, { title: 'T', points: ['x'.repeat(MAX_MEMORY_POINT_LENGTH + 1)] })).toMatchObject({ error: true })
    expect(await run(tools.update_memory, { id: 'm1', points: [' '] })).toMatchObject({ error: true })
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
