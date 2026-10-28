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
  /** The matching message's text. */
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
}

const QUERY_EMBED_TIMEOUT_MS = 10_000
/** Nearest chunks considered before grouping them by conversation. */
const NEAREST_CHUNKS = 100
/** Nearest chat summaries considered. */
const NEAREST_SUMMARIES = 20
/** Reciprocal rank fusion constant: higher values flatten the advantage of top-ranked hits. */
const RRF_K = 60

const tsquery = (q: string) => sql`websearch_to_tsquery('zhcfg', ${q})`

/** Best full-text match per live conversation of the user. */
function messageMatches(userId: string, q: string, excludeConversationId?: string): SQL {
  const tsq = tsquery(q)
  return sql`
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id, m.id AS message_id, m.search_text, ts_rank(m.tsv, ${tsq}) AS rank
    FROM message m
    JOIN conversation cv ON cv.id = m.conversation_id
    WHERE m.tsv @@ ${tsq}
      AND cv.user_id = ${userId} ${excludeConversationId ? sql`AND cv.id <> ${excludeConversationId}` : sql``}
      AND cv.deleted_at IS NULL AND m.deleted_at IS NULL
    ORDER BY m.conversation_id, rank DESC
  `
}

async function queryTerms(q: string): Promise<string[]> {
  const result = await db.execute<{ term: string }>(sql`SELECT unnest(tsvector_to_array(to_tsvector('zhcfg', ${q}))) AS term`)
  return result.rows.map((r) => r.term)
}

/** Full-text search over a user's live messages, one hit per conversation. */
export async function searchMessages(
  userId: string,
  q: string,
  { excludeConversationId, limit = 50 }: SearchOptions = {},
): Promise<MessageSearchResult> {
  const [rows, terms] = await Promise.all([
    db.execute<MessageSearchRow>(sql`
      SELECT hits.conversation_id, hits.message_id, cv.title, cv.icon, cv.created_at, cv.updated_at, hits.search_text, hits.rank
      FROM (${messageMatches(userId, q, excludeConversationId)}) hits
      JOIN conversation cv ON cv.id = hits.conversation_id
      ORDER BY hits.rank DESC, cv.updated_at DESC
      LIMIT ${limit}
    `).then((r) => r.rows),
    queryTerms(q),
  ])
  return { rows, terms }
}

export type ChatSearchRow = {
  conversation_id: string
  title: string
  updated_at: Date
  summary: string | null
  /** The best-matching message text or slice of it; empty when only the summary matched. */
  search_text: string
  rank: number
}

/**
 * Search a user's chats by their messages and summaries, fusing keyword and (with an embedding
 * model configured) vector rankings, one hit per conversation.
 */
export async function searchChats(
  userId: string,
  q: string,
  { excludeConversationId, limit = 10 }: SearchOptions = {},
): Promise<{ rows: ChatSearchRow[]; terms: string[] }> {
  const embedder = getEmbedder()
  let vector: number[] | undefined
  if (embedder) {
    try {
      ;[vector] = (await embedder.embed([q], AbortSignal.timeout(QUERY_EMBED_TIMEOUT_MS))) as [number[]]
    } catch (error) {
      console.warn('failed to embed search query; using full-text search only', error)
    }
  }
  const tsq = tsquery(q)
  const exclude = (column: SQL) => (excludeConversationId ? sql`AND ${column} <> ${excludeConversationId}` : sql``)
  const none = sql`SELECT NULL::text AS conversation_id, NULL::text AS text, NULL::bigint AS r WHERE false`
  const qv = vector && sql`${JSON.stringify(vector)}::vector`

  const vec = qv ? sql`
    SELECT conversation_id, text, row_number() OVER (ORDER BY distance) AS r FROM (
      SELECT DISTINCT ON (n.conversation_id) n.*
      FROM (
        SELECT c.conversation_id, c.message_id, c.text, c.embedding <=> ${qv} AS distance
        FROM message_chunk c
        WHERE c.user_id = ${userId} AND c.model = ${embedder!.key} ${exclude(sql`c.conversation_id`)}
        ORDER BY c.embedding <=> ${qv}
        LIMIT ${NEAREST_CHUNKS}
      ) n
      JOIN message m ON m.id = n.message_id AND m.deleted_at IS NULL
      ORDER BY n.conversation_id, n.distance
    ) v
  ` : none
  const svec = qv ? sql`
    SELECT conversation_id, NULL::text AS text, row_number() OVER (ORDER BY distance) AS r FROM (
      SELECT s.conversation_id, s.embedding <=> ${qv} AS distance
      FROM summary_embedding s
      WHERE s.user_id = ${userId} AND s.model = ${embedder!.key} ${exclude(sql`s.conversation_id`)}
      ORDER BY s.embedding <=> ${qv}
      LIMIT ${NEAREST_SUMMARIES}
    ) v
  ` : none
  const rrf = (r: SQL) => sql`coalesce(1.0 / (${RRF_K} + ${r}), 0)`

  const [rows, terms] = await Promise.all([
    db.transaction(async (tx) => {
      // Keep scanning the index past other users' vectors, so filtering still leaves enough neighbours.
      await tx.execute(sql`SET LOCAL hnsw.iterative_scan = relaxed_order`)
      await tx.execute(sql.raw(`SET LOCAL hnsw.ef_search = ${NEAREST_CHUNKS}`))
      const result = await tx.execute<ChatSearchRow>(sql`
        WITH fts AS (
          SELECT conversation_id, search_text, row_number() OVER (ORDER BY rank DESC) AS r
          FROM (${messageMatches(userId, q, excludeConversationId)}) f
        ),
        sfts AS (
          SELECT cv.id AS conversation_id, row_number() OVER (ORDER BY ts_rank(cv.summary_tsv, ${tsq}) DESC) AS r
          FROM conversation cv
          WHERE cv.user_id = ${userId} AND cv.deleted_at IS NULL AND cv.summary_tsv @@ ${tsq} ${exclude(sql`cv.id`)}
        ),
        vec AS (${vec}),
        svec AS (${svec})
        SELECT cv.id AS conversation_id, cv.title, cv.updated_at, cv.summary,
          coalesce(fts.search_text, vec.text, '') AS search_text,
          ${rrf(sql`fts.r`)} + ${rrf(sql`sfts.r`)} + ${rrf(sql`vec.r`)} + ${rrf(sql`svec.r`)} AS rank
        FROM conversation cv
        LEFT JOIN fts ON fts.conversation_id = cv.id
        LEFT JOIN sfts ON sfts.conversation_id = cv.id
        LEFT JOIN vec ON vec.conversation_id = cv.id
        LEFT JOIN svec ON svec.conversation_id = cv.id
        WHERE cv.user_id = ${userId} AND cv.deleted_at IS NULL
          AND coalesce(fts.r, sfts.r, vec.r, svec.r) IS NOT NULL
        ORDER BY rank DESC, cv.updated_at DESC
        LIMIT ${limit}
      `)
      return result.rows
    }),
    queryTerms(q),
  ])
  return { rows, terms }
}
