import { sql } from 'drizzle-orm'
import { db } from '../db'

export type MessageSearchRow = {
  conversation_id: string
  message_id: string
  title: string
  icon: string | null
  created_at: Date
  updated_at: Date
  search_text: string
  rank: number
}

export interface MessageSearchResult {
  /** The best-matching message of each conversation, most relevant first. */
  rows: MessageSearchRow[]
  /** The query's lexemes, for highlighting snippets. */
  terms: string[]
}

/** Full-text search over a user's live messages, one hit per conversation. */
export async function searchMessages(
  userId: string,
  q: string,
  { excludeConversationId, limit = 50 }: { excludeConversationId?: string; limit?: number } = {},
): Promise<MessageSearchResult> {
  const tsq = sql`websearch_to_tsquery('zhcfg', ${q})`
  const exclude = excludeConversationId ? sql`AND cv.id <> ${excludeConversationId}` : sql``
  const [result, termRows] = await Promise.all([
    db.execute<MessageSearchRow>(sql`
      SELECT * FROM (
        SELECT DISTINCT ON (m.conversation_id)
          m.conversation_id, m.id AS message_id, cv.title, cv.icon, cv.created_at, cv.updated_at, m.search_text,
          ts_rank(m.tsv, ${tsq}) AS rank
        FROM message m
        JOIN conversation cv ON cv.id = m.conversation_id
        WHERE m.tsv @@ ${tsq}
          AND cv.user_id = ${userId} ${exclude}
          AND cv.deleted_at IS NULL AND m.deleted_at IS NULL
        ORDER BY m.conversation_id, rank DESC
      ) hits
      ORDER BY rank DESC, updated_at DESC
      LIMIT ${limit}
    `),
    db.execute<{ term: string }>(sql`SELECT unnest(tsvector_to_array(to_tsvector('zhcfg', ${q}))) AS term`),
  ])
  return { rows: result.rows, terms: termRows.rows.map((r) => r.term) }
}
