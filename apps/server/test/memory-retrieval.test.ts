import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/db', async () => ({ schema: await import('../src/db/schema'), db: {} }))

import { consolidationInput, planChanges } from '../src/llm/memory-consolidation'
import { INJECT_ALL_CHARS, RELEVANT_COUNT, selectMemories, withContext, withPrelude } from '../src/llm/memory-retrieval'
import { memoryLabels, memoryPrompt, relevantMemoriesPrompt } from '../src/llm/user-memory'
import type { MemoryRow } from '../src/services/memories'

const topic = (i: number, extra: Partial<MemoryRow> = {}): MemoryRow => ({
  id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, userId: 'alice', kind: 'topic', title: `Topic ${i}`,
  summary: `About ${i}`, points: [`fact ${i}a`, `fact ${i}b`],
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)), updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)), ...extra,
})
/** `n` topics whose points total `chars` characters each. */
const many = (n: number, chars = 100, profile: number[] = []) =>
  Array.from({ length: n }, (_, i) => topic(i, { points: ['x'.repeat(chars)], ...(profile.includes(i) && { kind: 'profile' as const }) }))

describe('memory selection', () => {
  it('gives every topic in full while the points fit', () => {
    const memories = many(INJECT_ALL_CHARS / 100, 100, [3])
    const selection = selectMemories(memories, ['x'])
    expect(selection).toMatchObject({ topics: memories, relevant: [], partial: false })
    expect(selection.expanded.size).toBe(memories.length)
  })

  it('lists every topic but expands only the profile, adding relevant ones in list order', () => {
    const memories = many(30, 200, [1, 2])
    const selection = selectMemories(memories, [memories[20]!.id, memories[5]!.id, memories[1]!.id])
    expect(selection.partial).toBe(true)
    expect(selection.topics).toBe(memories)
    expect([...selection.expanded]).toEqual([memories[1]!.id, memories[2]!.id])
    // A profile id among the relevant ones isn't repeated; the rest read in list order, not rank.
    expect(selection.relevant.map((m) => m.title)).toEqual(['Topic 5', 'Topic 20'])
  })

  it('falls back to the most recently changed topics within a budget', () => {
    const memories = many(30, 200)
    memories[0]!.updatedAt = new Date(Date.UTC(2026, 5, 1))
    const { relevant } = selectMemories(memories)
    expect(relevant).toHaveLength(RELEVANT_COUNT)
    expect(relevant.map((m) => m.title)).toEqual(['Topic 0', 'Topic 28', 'Topic 29'])
  })
})

describe('memory prompts', () => {
  const profile = topic(1, { kind: 'profile', title: 'Profile', summary: 'Who the user is', points: ['Is a backend engineer'] })
  const fitness = topic(2, { title: 'Fitness', points: ['Runs 5k on weekends'] })
  const app = topic(3, { kind: 'project', title: 'Minka', summary: '', points: ['An iOS health app'] })

  it('index every topic by kind and show points only where expanded', () => {
    const prompt = memoryPrompt([profile, fitness, app], { expanded: (id) => id === profile.id, partial: true, canRead: true })!
    expect(prompt).toContain('## About the user\n- [00000001] Profile (2026-01-01): Who the user is\n  - Is a backend engineer')
    expect(prompt).toContain('## Topics\n- [00000002] Fitness (2026-01-01): About 2\n\n## Projects\n- [00000003] Minka (2026-01-01)\n</user_memories>')
    expect(prompt).not.toContain('Runs 5k')
    expect(prompt).toContain('call read_memory')
    expect(prompt).toContain('not instructions')
  })

  it('show every point when all fit, and nothing when there are no memories', () => {
    const prompt = memoryPrompt([profile, fitness])!
    expect(prompt).toContain('  - Runs 5k on weekends')
    expect(prompt).not.toContain('Only some topics')
    expect(memoryPrompt([])).toBeUndefined()
  })

  it('give relevant topics’ points with the message', () => {
    const label = memoryLabels([profile, fitness])
    expect(relevantMemoriesPrompt([fitness], label)).toContain('- [00000002] Fitness (2026-01-01): About 2\n  - Runs 5k on weekends')
    expect(relevantMemoriesPrompt([])).toBeUndefined()
  })

  it('shorten ids, unless two would collide', () => {
    const a = topic(1, { id: '3f2a9c1e-0000-4000-8000-000000000001', title: 'A' })
    const b = topic(2, { id: '3f2a9c1e-0000-4000-8000-000000000002', title: 'B' })
    const c = topic(3, { id: '7b1bf7a1-0000-4000-8000-000000000003', title: 'C' })
    const prompt = memoryPrompt([a, b, c])!
    expect(prompt).toContain('- [3f2a9c1e-0000-4000-8000-000000000001] A')
    expect(prompt).toContain('- [7b1bf7a1] C')
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

  it('put a prelude in its own message before the first user message', () => {
    const messages = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'reply' },
    ]
    const out = withPrelude(messages, '<related_chats>c</related_chats>')
    expect(out).toEqual([{ role: 'user', content: [{ type: 'text', text: '<related_chats>c</related_chats>' }] }, ...messages])
    expect(withPrelude(messages, undefined)).toBe(messages)
  })
})

describe('memory consolidation', () => {
  const memories = Array.from({ length: 6 }, (_, i) => topic(i, i === 0 ? { kind: 'profile' } : {}))
  const label = memoryLabels(memories)
  const rewrite = (i: number, extra: object = {}) => ({ id: label(memories[i]!.id), kind: memories[i]!.kind, title: memories[i]!.title, summary: memories[i]!.summary, points: memories[i]!.points, reason: 'tidy', ...extra })

  it('shows the model ids, kinds, dates, summaries and numbered points', () => {
    const input = consolidationInput(memories, label, new Date('2026-10-28T00:00:00Z'))
    expect(input).toContain('Today: 2026-10-28')
    expect(input).toContain('[00000000] profile · Topic 0 (2026-01-01): About 0\n  1. fact 0a\n  2. fact 0b')
  })

  it('keeps one valid change per known topic, and new topics', () => {
    const changes = planChanges(memories, label, {
      topics: [
        rewrite(1, { points: ['fact 1a', 'fact 1b', 'fact 2a', 'fact 2b'], summary: 'About 1 and 2' }),
        rewrite(1, { points: [] }),
        rewrite(3),
        rewrite(4, { points: ['fact 4a', ' ', 'x'.repeat(301)], title: 'x'.repeat(41) }),
        { id: 'unknown', kind: 'topic', title: 'U', summary: '', points: ['p'], reason: 'x' },
        { id: null, kind: 'project', title: 'Split', summary: 'Moved out', points: ['fact 4b'], reason: 'split' },
      ],
      deleted: [{ id: label(memories[2]!.id), reason: 'merged' }, { id: label(memories[1]!.id), reason: 'twice' }],
    })
    expect(changes).toEqual([
      { action: 'update', id: memories[1]!.id, content: { kind: 'topic', title: 'Topic 1', summary: 'About 1 and 2', points: ['fact 1a', 'fact 1b', 'fact 2a', 'fact 2b'] }, reason: 'tidy' },
      // Invalid points are dropped and an invalid title is kept as it was.
      { action: 'update', id: memories[4]!.id, content: { kind: 'topic', title: 'Topic 4', summary: 'About 4', points: ['fact 4a'] }, reason: 'tidy' },
      { action: 'delete', id: memories[2]!.id, reason: 'merged' },
      { action: 'add', content: { kind: 'project', title: 'Split', summary: 'Moved out', points: ['fact 4b'] }, reason: 'split' },
    ])
  })

  it('leaves topics alone whose tidying the user undid', () => {
    const changes = planChanges(memories, label, {
      topics: [],
      deleted: [{ id: label(memories[5]!.id), reason: 'dup' }, { id: label(memories[4]!.id), reason: 'dup' }],
    }, new Set([memories[5]!.id]))
    expect(changes).toEqual([{ action: 'delete', id: memories[4]!.id, reason: 'dup' }])
  })

  it('skips a pass that would lose most points', () => {
    const deleted = memories.slice(0, 4).map((m) => ({ id: label(m.id), reason: 'x' }))
    expect(planChanges(memories, label, { topics: [], deleted })).toEqual([])
  })
})
