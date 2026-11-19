import type { ModelMessage } from 'ai'
import { sql } from 'drizzle-orm'
import { db } from '../db'
import { listMemories, type MemoryRow } from '../services/memories'
import { getEmbedder } from './embedding'

/** While all points together are this short, every topic is given in full. */
export const INJECT_ALL_CHARS = 4000
/** Non-profile topics whose points come with each message once not all fit. */
export const RELEVANT_COUNT = 3
/** Without an embedding model, the most recently changed topics within this many characters of points. */
const RECENT_CHARS = 2000
/** Chat replies wait on this, so a slow embedding falls back to recent topics. */
const QUERY_TIMEOUT_MS = 5000
const MAX_QUERY_CHARS = 2000

export interface MemorySelection {
  /** Every topic, for the index in the system prompt. */
  topics: MemoryRow[]
  /** Ids of the topics whose points are in the system prompt: all of them, or the profile ones once not all fit. */
  expanded: Set<string>
  /** Other topics whose points come with the user's latest message, in list order. */
  relevant: MemoryRow[]
  /** Whether some topics' points were left out of the system prompt. */
  partial: boolean
}

const pointChars = (m: MemoryRow) => m.points.reduce((n, p) => n + p.length, 0)

export const fitsInPrompt = (memories: MemoryRow[]) => memories.reduce((n, m) => n + pointChars(m), 0) <= INJECT_ALL_CHARS

/**
 * Pick what to show of the user's topics for one reply. `relevantIds` ranks the non-profile
 * topics by similarity to the message; without it the most recently changed are used.
 */
export function selectMemories(memories: MemoryRow[], relevantIds?: string[]): MemorySelection {
  if (fitsInPrompt(memories)) return { topics: memories, expanded: new Set(memories.map((m) => m.id)), relevant: [], partial: false }
  const expanded = new Set(memories.filter((m) => m.kind === 'profile').map((m) => m.id))
  const rest = memories.filter((m) => !expanded.has(m.id))
  const chosen = new Set<string>()
  if (relevantIds) {
    for (const id of relevantIds.slice(0, RELEVANT_COUNT)) chosen.add(id)
  } else {
    let budget = RECENT_CHARS
    for (const m of rest.toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())) {
      if (chosen.size >= RELEVANT_COUNT || pointChars(m) > budget) break
      budget -= pointChars(m)
      chosen.add(m.id)
    }
  }
  // List order, not rank: the same set then always reads the same.
  return { topics: memories, expanded, relevant: rest.filter((m) => chosen.has(m.id)), partial: true }
}

/** The user's topics closest to `vector` by cosine similarity. */
export async function nearestMemories(
  userId: string,
  model: string,
  vector: number[],
  limit: number,
  { skipProfile = false } = {},
): Promise<{ id: string; similarity: number }[]> {
  const qv = sql`${JSON.stringify(vector)}::vector`
  const result = await db.execute<{ id: string; similarity: number }>(sql`
    SELECT e.memory_id AS id, 1 - (e.embedding <=> ${qv}) AS similarity
    FROM memory_embedding e
    JOIN user_memory um ON um.id = e.memory_id
    WHERE um.user_id = ${userId} AND e.model = ${model} ${skipProfile ? sql`AND um.kind <> 'profile'` : sql``}
    ORDER BY e.embedding <=> ${qv}
    LIMIT ${limit}
  `)
  return result.rows.map((r) => ({ id: r.id, similarity: Number(r.similarity) }))
}

export interface QueryEmbedding {
  /** The embedding model's key, as stored with each vector. */
  key: string
  vector: number[]
}

/**
 * Embed the user's latest message at most once, on first use, for everyone ranking by it.
 * Resolves to undefined without an embedding model or an empty message; rejects when embedding fails.
 */
export function queryEmbedding(query: string): () => Promise<QueryEmbedding | undefined> {
  let pending: Promise<QueryEmbedding | undefined> | undefined
  return () => (pending ??= (async () => {
    const embedder = getEmbedder()
    if (!embedder || !query.trim()) return undefined
    const [vector] = await embedder.embed([query.slice(0, MAX_QUERY_CHARS)], AbortSignal.timeout(QUERY_TIMEOUT_MS))
    return { key: embedder.key, vector: vector! }
  })())
}

/** Non-profile topics most similar to the query; undefined when there's no embedding model or it fails. */
async function relevantMemoryIds(userId: string, embedQuery: () => Promise<QueryEmbedding | undefined>): Promise<string[] | undefined> {
  try {
    const query = await embedQuery()
    if (!query) return undefined
    const nearest = await nearestMemories(userId, query.key, query.vector, RELEVANT_COUNT, { skipProfile: true })
    return nearest.map((r) => r.id)
  } catch (error) {
    console.warn('failed to rank memories; using recent ones', error)
    return undefined
  }
}

/** The memories for a reply to the user's latest message, embedded by `embedQuery` when needed. */
export async function loadMemories(userId: string, embedQuery: () => Promise<QueryEmbedding | undefined>): Promise<MemorySelection> {
  const memories = await listMemories(userId)
  if (fitsInPrompt(memories)) return selectMemories(memories)
  return selectMemories(memories, await relevantMemoryIds(userId, embedQuery))
}

/**
 * Put `block` in front of the latest user message for this request only. The system prompt and
 * history stay byte-for-byte the same between turns, so prompt caching keeps working.
 */
export function withContext(messages: ModelMessage[], block: string | undefined): ModelMessage[] {
  if (!block) return messages
  const index = messages.findLastIndex((m) => m.role === 'user')
  if (index < 0) return messages
  const message = messages[index] as Extract<ModelMessage, { role: 'user' }>
  const parts = typeof message.content === 'string' ? [{ type: 'text' as const, text: message.content }] : message.content
  return messages.with(index, { ...message, content: [{ type: 'text', text: block }, ...parts] })
}

/**
 * Put `block` in its own user message before the first one, for the model only. It is the same on
 * every turn, so everything after it stays cached; the chat itself never shows it.
 */
export function withPrelude(messages: ModelMessage[], block: string | undefined): ModelMessage[] {
  if (!block) return messages
  const index = messages.findIndex((m) => m.role === 'user')
  if (index < 0) return messages
  return messages.toSpliced(index, 0, { role: 'user', content: [{ type: 'text', text: block }] })
}
