import { inArray, sql } from 'drizzle-orm'
import { db, schema } from '../db'
import { backgroundLoop } from '../lib/background-job'
import { getEmbedder } from './embedding'

const CHUNK_CHARS = 1500
const CHUNK_OVERLAP = 200
/** Later text of very long messages is left out of semantic search, bounding the cost per message. */
const MAX_CHUNKS = 20
/** Messages embedded per run; their chunks go to the provider in one batch call. */
const BATCH_MESSAGES = 32
const IDLE_MS = 30_000
const RETRY_MS = 5 * 60_000
const NUDGE_MS = 2000

/** Split text into overlapping slices, breaking at whitespace or punctuation near the end of each one. */
export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  const chunks: string[] = []
  let start = 0
  while (start < clean.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(clean.length, start + CHUNK_CHARS)
    if (end < clean.length) {
      const window = clean.slice(start + CHUNK_CHARS - CHUNK_OVERLAP, end)
      const brk = Math.max(...[' ', '。', '！', '？'].map((s) => window.lastIndexOf(s)))
      if (brk > 0) end = start + CHUNK_CHARS - CHUNK_OVERLAP + brk + 1
    }
    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    start = end - CHUNK_OVERLAP
  }
  return chunks.filter(Boolean)
}

/**
 * Embed one batch of messages that have no chunks for the configured model.
 * Returns how many messages were indexed; 0 when nothing is pending or no model is configured.
 */
export async function indexPendingMessages(abortSignal?: AbortSignal): Promise<number> {
  const embedder = getEmbedder()
  if (!embedder) return 0
  const pending = await db.execute<{ id: string; conversation_id: string; user_id: string; search_text: string }>(sql`
    SELECT m.id, m.conversation_id, cv.user_id, m.search_text
    FROM message m
    JOIN conversation cv ON cv.id = m.conversation_id
    WHERE m.deleted_at IS NULL AND cv.deleted_at IS NULL AND m.search_text ~ '\\S'
      AND NOT EXISTS (SELECT 1 FROM message_chunk c WHERE c.message_id = m.id AND c.model = ${embedder.key})
    ORDER BY m.created_at DESC
    LIMIT ${BATCH_MESSAGES}
  `)
  if (pending.rows.length === 0) return 0

  const rows = pending.rows.flatMap((m) =>
    chunkText(m.search_text).map((text, index) => ({
      messageId: m.id, index, userId: m.user_id, conversationId: m.conversation_id, model: embedder.key, text,
    })),
  )
  const vectors = await embedder.embed(rows.map((r) => r.text), abortSignal)
  const ids = pending.rows.map((m) => m.id)
  const c = schema.messageChunks
  await db.transaction(async (tx) => {
    // Drop chunks of an earlier model, and any left by a concurrent run of the same batch.
    await tx.delete(c).where(inArray(c.messageId, ids))
    if (rows.length) await tx.insert(c).values(rows.map((r, i) => ({ ...r, embedding: vectors[i]! })))
  })
  return ids.length
}

/** Embed one batch of chat summaries with no vector for the current model and text; returns how many. */
export async function indexPendingSummaries(abortSignal?: AbortSignal): Promise<number> {
  const embedder = getEmbedder()
  if (!embedder) return 0
  const pending = await db.execute<{ id: string; user_id: string; summary: string }>(sql`
    SELECT cv.id, cv.user_id, cv.summary
    FROM conversation cv
    LEFT JOIN summary_embedding s ON s.conversation_id = cv.id AND s.model = ${embedder.key} AND s.text = cv.summary
    WHERE cv.deleted_at IS NULL AND cv.summary ~ '\\S' AND s.conversation_id IS NULL
    ORDER BY cv.updated_at DESC
    LIMIT ${BATCH_MESSAGES}
  `)
  if (pending.rows.length === 0) return 0
  const vectors = await embedder.embed(pending.rows.map((r) => r.summary), abortSignal)
  const s = schema.summaryEmbeddings
  for (const [i, r] of pending.rows.entries()) {
    const values = { model: embedder.key, text: r.summary, embedding: vectors[i]! }
    await db.insert(s).values({ conversationId: r.id, userId: r.user_id, ...values })
      .onConflictDoUpdate({ target: s.conversationId, set: values })
  }
  return pending.rows.length
}

export async function saveMemoryEmbedding(memoryId: string, model: string, text: string, embedding: number[], tx: Pick<typeof db, 'insert'> = db) {
  const e = schema.memoryEmbeddings
  await tx.insert(e).values({ memoryId, model, text, embedding })
    .onConflictDoUpdate({ target: e.memoryId, set: { model, text, embedding } })
}

/**
 * Embed one batch of memories (of one user, or anyone's) with no vector for the current model
 * and text, as relevance retrieval and duplicate checks need them; returns how many.
 */
export async function indexPendingMemories({ userId, abortSignal }: { userId?: string; abortSignal?: AbortSignal } = {}): Promise<number> {
  const embedder = getEmbedder()
  if (!embedder) return 0
  const pending = await db.execute<{ id: string; content: string }>(sql`
    SELECT um.id, um.content FROM user_memory um
    LEFT JOIN memory_embedding e ON e.memory_id = um.id AND e.model = ${embedder.key} AND e.text = um.content
    WHERE e.memory_id IS NULL ${userId ? sql`AND um.user_id = ${userId}` : sql``}
    ORDER BY um.updated_at DESC
    LIMIT ${userId ? 1000 : BATCH_MESSAGES}
  `)
  if (pending.rows.length === 0) return 0
  const vectors = await embedder.embed(pending.rows.map((r) => r.content), abortSignal ?? AbortSignal.timeout(60_000))
  for (const [i, r] of pending.rows.entries()) await saveMemoryEmbedding(r.id, embedder.key, r.content, vectors[i]!)
  return pending.rows.length
}

/** Index new and backfilled messages, summaries and memories in the background for as long as the server runs. */
const indexer = backgroundLoop('embedding', {
  startMs: NUDGE_MS,
  idleMs: IDLE_MS,
  retryMs: RETRY_MS,
  async pass(active) {
    // Keep going while there is a backlog, e.g. after enabling search or changing the model.
    for (let more = true; more && active();) {
      const messages = await indexPendingMessages(AbortSignal.timeout(60_000))
      const summaries = await indexPendingSummaries(AbortSignal.timeout(60_000))
      const memories = await indexPendingMemories({ abortSignal: AbortSignal.timeout(60_000) })
      more = [messages, summaries, memories].includes(BATCH_MESSAGES)
    }
  },
})

export const startEmbeddingIndexer = indexer.start
export const stopEmbeddingIndexer = indexer.stop
/** Index soon after new messages are saved or the model changes; a no-op until the indexer starts. */
export const nudgeEmbeddingIndexer = indexer.nudge
