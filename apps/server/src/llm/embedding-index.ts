import { inArray, sql } from 'drizzle-orm'
import { db, schema } from '../db'
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

let timer: NodeJS.Timeout | undefined
let running: Promise<void> | undefined
let started = false

function schedule(ms: number) {
  clearTimeout(timer)
  timer = setTimeout(() => void run(), ms).unref()
}

async function run(): Promise<void> {
  if (running) return running
  running = (async () => {
    let delay = IDLE_MS
    try {
      // Keep going while there is a backlog, e.g. after enabling search or changing the model.
      while ((await indexPendingMessages(AbortSignal.timeout(60_000))) === BATCH_MESSAGES);
    } catch (error) {
      console.warn('failed to embed messages', error)
      delay = RETRY_MS
    } finally {
      running = undefined
      if (started) schedule(delay)
    }
  })()
  return running
}

/** Index new and backfilled messages in the background for as long as the server runs. */
export function startEmbeddingIndexer(): void {
  started = true
  schedule(NUDGE_MS)
}

export function stopEmbeddingIndexer(): void {
  started = false
  clearTimeout(timer)
}

/** Index soon after new messages are saved or the model changes; a no-op until the indexer starts. */
export function nudgeEmbeddingIndexer(): void {
  if (started && !running) schedule(NUDGE_MS)
}
