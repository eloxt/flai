import { type SQL, sql } from 'drizzle-orm'
import { db } from '../db'
import { getEmbedder } from '../llm/embedding'

export type MessageSearchRow = {
  conversation_id: string
  message_id: string
  title: string
  icon: string | null
  created_at: Date
  updated_at: Date
  /** The matching message's text, or the matching slice of it for a semantic-only hit. */
  search_text: string
  rank: number
}

export interface MessageSearchResult {
  /** The best-matching message of each conversation, most relevant first. */
  rows: MessageSearchRow[]
  /** The query's lexemes, for highlighting snippets. */
  terms: string[]
}

interface SearchOptions {
  excludeConversationId?: string
  limit?: number
  /** Also rank by meaning with the configured embedding model, when there is one. */
  semantic?: boolean
}

const QUERY_EMBED_TIMEOUT_MS = 10_000
/** Nearest chunks considered before grouping them by conversation. */
const NEAREST_CHUNKS = 100
/** Reciprocal rank fusion constant: higher values flatten the advantage of top-ranked hits. */
const RRF_K = 60

/** Search a user's live messages, one hit per conversation: full-text, fused with vector search when `semantic`. */
export async function searchMessages(
  userId: string,
  q: string,
  { excludeConversationId, limit = 50, semantic = false }: SearchOptions = {},
): Promise<MessageSearchResult> {
  const tsq = sql`websearch_to_tsquery('zhcfg', ${q})`
  const fts = sql`
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id, m.id AS message_id, m.search_text, ts_rank(m.tsv, ${tsq}) AS rank
    FROM message m
    JOIN conversation cv ON cv.id = m.conversation_id
    WHERE m.tsv @@ ${tsq}
      AND cv.user_id = ${userId} ${excludeConversationId ? sql`AND cv.id <> ${excludeConversationId}` : sql``}
      AND cv.deleted_at IS NULL AND m.deleted_at IS NULL
    ORDER BY m.conversation_id, rank DESC
  `
  const [rows, termRows] = await Promise.all([
    (async () => (semantic && (await hybridSearch(userId, q, fts, excludeConversationId, limit))) ||
      db.execute<MessageSearchRow>(sql`
        SELECT hits.conversation_id, hits.message_id, cv.title, cv.icon, cv.created_at, cv.updated_at, hits.search_text, hits.rank
        FROM (${fts}) hits
        JOIN conversation cv ON cv.id = hits.conversation_id
        ORDER BY hits.rank DESC, cv.updated_at DESC
        LIMIT ${limit}
      `).then((r) => r.rows))(),
    db.execute<{ term: string }>(sql`SELECT unnest(tsvector_to_array(to_tsvector('zhcfg', ${q}))) AS term`),
  ])
  return { rows, terms: termRows.rows.map((r) => r.term) }
}

/** Fuse full-text and nearest-chunk rankings; null when no model is configured or the query cannot be embedded. */
async function hybridSearch(
  userId: string,
  q: string,
  fts: SQL,
  excludeConversationId: string | undefined,
  limit: number,
): Promise<MessageSearchRow[] | null> {
  const embedder = getEmbedder()
  if (!embedder) return null
  let vector: number[]
  try {
    ;[vector] = (await embedder.embed([q], AbortSignal.timeout(QUERY_EMBED_TIMEOUT_MS))) as [number[]]
  } catch (error) {
    console.warn('failed to embed search query; using full-text search only', error)
    return null
  }
  const qv = sql`${JSON.stringify(vector)}::vector`
  return db.transaction(async (tx) => {
    // Keep scanning the index past other users' chunks, so filtering still leaves enough neighbours.
    await tx.execute(sql`SET LOCAL hnsw.iterative_scan = relaxed_order`)
    await tx.execute(sql.raw(`SET LOCAL hnsw.ef_search = ${NEAREST_CHUNKS}`))
    const result = await tx.execute<MessageSearchRow>(sql`
      WITH fts AS (
        SELECT conversation_id, message_id, search_text, row_number() OVER (ORDER BY rank DESC) AS r FROM (${fts}) f
      ),
      nearest AS (
        SELECT c.conversation_id, c.message_id, c.text, c.embedding <=> ${qv} AS distance
        FROM message_chunk c
        WHERE c.user_id = ${userId} AND c.model = ${embedder.key}
          ${excludeConversationId ? sql`AND c.conversation_id <> ${excludeConversationId}` : sql``}
        ORDER BY c.embedding <=> ${qv}
        LIMIT ${NEAREST_CHUNKS}
      ),
      vec AS (
        SELECT conversation_id, message_id, text, row_number() OVER (ORDER BY distance) AS r FROM (
          SELECT DISTINCT ON (n.conversation_id) n.*
          FROM nearest n
          JOIN message m ON m.id = n.message_id AND m.deleted_at IS NULL
          JOIN conversation cv ON cv.id = n.conversation_id AND cv.deleted_at IS NULL
          ORDER BY n.conversation_id, n.distance
        ) v
      )
      SELECT cv.id AS conversation_id, coalesce(fts.message_id, vec.message_id) AS message_id,
        cv.title, cv.icon, cv.created_at, cv.updated_at,
        coalesce(fts.search_text, vec.text) AS search_text,
        coalesce(1.0 / (${RRF_K} + fts.r), 0) + coalesce(1.0 / (${RRF_K} + vec.r), 0) AS rank
      FROM fts
      FULL OUTER JOIN vec ON vec.conversation_id = fts.conversation_id
      JOIN conversation cv ON cv.id = coalesce(fts.conversation_id, vec.conversation_id)
      ORDER BY rank DESC, cv.updated_at DESC
      LIMIT ${limit}
    `)
    return result.rows
  })
}
