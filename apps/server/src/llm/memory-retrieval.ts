import type { ModelMessage } from 'ai'
import { sql } from 'drizzle-orm'
import { db } from '../db'
import { listMemories, type MemoryRow } from '../services/memories'
import { getEmbedder } from './embedding'
import { indexPendingMemories } from './embedding-index'

/** Up to these, every memory goes into the system prompt; beyond them only core plus relevant ones. */
export const INJECT_ALL_COUNT = 30
export const INJECT_ALL_CHARS = 3000
/** Non-core memories given with each message once there are too many to list. */
export const RELEVANT_COUNT = 8
/** Without an embedding model, the most recently changed memories within this many characters. */
const RECENT_CHARS = 1500
/** Chat replies wait on this, so a slow embedding falls back to recent memories. */
const QUERY_TIMEOUT_MS = 5000
const MAX_QUERY_CHARS = 2000
/** Cosine similarity at which a new memory is taken as a restatement of an existing one. */
export const DUPLICATE_SIMILARITY = 0.9

export interface MemorySelection {
  /** Listed in the system prompt: every memory, or only the pinned ones when there are many. */
  core: MemoryRow[]
  /** Given with the user's latest message, in list order. */
  relevant: MemoryRow[]
  /** Whether some memories were left out. */
  partial: boolean
}

export const fitsInPrompt = (memories: MemoryRow[]) =>
  memories.length <= INJECT_ALL_COUNT && memories.reduce((n, m) => n + m.content.length, 0) <= INJECT_ALL_CHARS

/**
 * Pick the memories for one reply from the user's list (oldest first). `relevantIds` ranks the
 * non-core memories by similarity to the message; without it the most recently changed are used.
 */
export function selectMemories(memories: MemoryRow[], relevantIds?: string[]): MemorySelection {
  if (fitsInPrompt(memories)) return { core: memories, relevant: [], partial: false }
  const core = memories.filter((m) => m.pinned)
  const rest = memories.filter((m) => !m.pinned)
  const chosen = new Set<string>()
  if (relevantIds) {
    for (const id of relevantIds.slice(0, RELEVANT_COUNT)) chosen.add(id)
  } else {
    let budget = RECENT_CHARS
    for (const m of rest.toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())) {
      if (chosen.size >= RELEVANT_COUNT || m.content.length > budget) break
      budget -= m.content.length
      chosen.add(m.id)
    }
  }
  // List order, not rank: the same set then always reads the same.
  return { core, relevant: rest.filter((m) => chosen.has(m.id)), partial: true }
}

/** The user's memories closest to `vector` by cosine similarity. */
export async function nearestMemories(
  userId: string,
  model: string,
  vector: number[],
  limit: number,
  { unpinnedOnly = false } = {},
): Promise<{ id: string; similarity: number }[]> {
  const qv = sql`${JSON.stringify(vector)}::vector`
  const result = await db.execute<{ id: string; similarity: number }>(sql`
    SELECT e.memory_id AS id, 1 - (e.embedding <=> ${qv}) AS similarity
    FROM memory_embedding e
    JOIN user_memory um ON um.id = e.memory_id
    WHERE um.user_id = ${userId} AND e.model = ${model} ${unpinnedOnly ? sql`AND NOT um.pinned` : sql``}
    ORDER BY e.embedding <=> ${qv}
    LIMIT ${limit}
  `)
  return result.rows.map((r) => ({ id: r.id, similarity: Number(r.similarity) }))
}

/** The id of a saved memory that `content` restates, when an embedding model can tell. */
export async function findDuplicate(userId: string, content: string): Promise<string | undefined> {
  const embedder = getEmbedder()
  if (!embedder) return undefined
  try {
    await indexPendingMemories({ userId })
    const [vector] = await embedder.embed([content], AbortSignal.timeout(QUERY_TIMEOUT_MS))
    const [nearest] = await nearestMemories(userId, embedder.key, vector!, 1)
    return nearest && nearest.similarity >= DUPLICATE_SIMILARITY ? nearest.id : undefined
  } catch (error) {
    console.warn('failed to check for a duplicate memory', error)
    return undefined
  }
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

/** Non-core memories most similar to the query; undefined when there's no embedding model or it fails. */
async function relevantMemoryIds(userId: string, embedQuery: () => Promise<QueryEmbedding | undefined>): Promise<string[] | undefined> {
  try {
    const query = await embedQuery()
    if (!query) return undefined
    const nearest = await nearestMemories(userId, query.key, query.vector, RELEVANT_COUNT, { unpinnedOnly: true })
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
