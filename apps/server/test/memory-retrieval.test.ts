import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/db', async () => ({ schema: await import('../src/db/schema'), db: {} }))

import { consolidationInput, planChanges } from '../src/llm/memory-consolidation'
import { INJECT_ALL_COUNT, RELEVANT_COUNT, selectMemories, withContext } from '../src/llm/memory-retrieval'
import { memoryLabels, memoryPrompt, relevantMemoriesPrompt } from '../src/llm/user-memory'
import type { MemoryRow } from '../src/services/memories'

const memory = (i: number, extra: Partial<MemoryRow> = {}): MemoryRow => ({
  id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, userId: 'alice', content: `fact ${i}`, pinned: false,
  sourceConversationId: null, createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)), updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)), ...extra,
})
const many = (n: number, pinned: number[] = []) => Array.from({ length: n }, (_, i) => memory(i, { pinned: pinned.includes(i) }))

describe('memory selection', () => {
  it('lists every memory while they fit', () => {
    const memories = many(INJECT_ALL_COUNT, [3])
    expect(selectMemories(memories, ['x'])).toEqual({ core: memories, relevant: [], partial: false })
  })

  it('keeps pinned memories and adds the relevant ones in list order', () => {
    const memories = many(40, [1, 2])
    const ids = (rows: MemoryRow[]) => rows.map((m) => m.content)
    const selection = selectMemories(memories, [memories[30]!.id, memories[5]!.id, memories[1]!.id])
    expect(selection.partial).toBe(true)
    expect(ids(selection.core)).toEqual(['fact 1', 'fact 2'])
    // A pinned id among the relevant ones isn't repeated; the rest read in list order, not rank.
    expect(ids(selection.relevant)).toEqual(['fact 5', 'fact 30'])
  })

  it('falls back to the most recently changed memories within a budget', () => {
    const memories = many(40)
    memories[0]!.updatedAt = new Date(Date.UTC(2026, 5, 1))
    const { relevant } = selectMemories(memories)
    expect(relevant).toHaveLength(RELEVANT_COUNT)
    expect(relevant.map((m) => m.content)).toEqual(['fact 0', 'fact 33', 'fact 34', 'fact 35', 'fact 36', 'fact 37', 'fact 38', 'fact 39'])
  })

  it('also leaves out memories once their text is too long, however few', () => {
    const memories = many(5).map((m) => ({ ...m, content: 'x'.repeat(200) })).concat(many(20).map((m, i) => ({ ...m, id: `y${i}`, content: 'y'.repeat(150) })))
    expect(selectMemories(memories).partial).toBe(true)
  })
})

describe('memory prompts', () => {
  it('say when only core memories are listed, and give the rest with the message', () => {
    const [core, other] = [memory(1, { pinned: true }), memory(2)]
    const label = memoryLabels([core, other])
    expect(memoryPrompt([core], { partial: true, label })).toContain('Only core memories are listed here')
    expect(memoryPrompt([], { partial: true })).toContain('<user_memories>')
    expect(memoryPrompt([])).toBeUndefined()
    expect(relevantMemoriesPrompt([other], label)).toContain('- [00000002] (2026-01-01) fact 2')
    expect(relevantMemoriesPrompt([])).toBeUndefined()
  })

  it('go in front of the latest user message only', () => {
    const messages = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'reply' },
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'second' }] },
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'answered question' }] },
    ]
    const out = withContext(messages, '<relevant_memories>m</relevant_memories>')
    expect(out[0]).toBe(messages[0])
    expect(out[2]!.content).toEqual([{ type: 'text', text: '<relevant_memories>m</relevant_memories>' }, { type: 'text', text: 'second' }])
    expect(messages[2]!.content).toHaveLength(1)
    expect(withContext(messages, undefined)).toBe(messages)
  })
})

describe('memory consolidation', () => {
  const memories = many(20, [0])
  const label = memoryLabels(memories)

  it('shows the model ids, pins and dates', () => {
    const input = consolidationInput(memories, label, new Date('2026-10-28T00:00:00Z'))
    expect(input).toContain('Today: 2026-10-28')
    expect(input).toContain('- [00000000] (pinned) (2026-01-01) fact 0')
    expect(input).toContain('- [00000001] (2026-01-01) fact 1')
  })

  it('keeps one valid change per known memory', () => {
    const changes = planChanges(memories, label, [
      { action: 'update', id: '00000001', content: 'fact 1 and 2', reason: 'merged' },
      { action: 'delete', id: '00000002', content: null, reason: 'merged' },
      { action: 'delete', id: '00000001', content: null, reason: 'twice' },
      { action: 'delete', id: 'unknown', content: null, reason: 'x' },
      { action: 'update', id: '00000003', content: 'fact 3', reason: 'unchanged' },
      { action: 'update', id: '00000004', content: 'x'.repeat(201), reason: 'too long' },
    ])
    expect(changes).toEqual([
      { action: 'update', id: memories[1]!.id, content: 'fact 1 and 2', reason: 'merged' },
      { action: 'delete', id: memories[2]!.id, reason: 'merged' },
    ])
  })

  it('leaves memories alone whose tidying the user undid', () => {
    const changes = planChanges(memories, label, [
      { action: 'delete', id: '00000005', content: null, reason: 'duplicate' },
      { action: 'delete', id: '00000006', content: null, reason: 'duplicate' },
    ], new Set([memories[5]!.id]))
    expect(changes).toEqual([{ action: 'delete', id: memories[6]!.id, reason: 'duplicate' }])
  })

  it('skips a pass that would delete most memories', () => {
    const changes = memories.slice(0, 11).map((m) => ({ action: 'delete' as const, id: label(m.id), content: null, reason: 'x' }))
    expect(planChanges(memories, label, changes)).toEqual([])
  })
})
