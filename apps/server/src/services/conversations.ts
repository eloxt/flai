import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, schema, type Tx } from '../db'
import { notFound } from '../lib/errors'
import type { UserRow } from '../lib/hono'

export type ConversationRow = typeof schema.conversations.$inferSelect
export type MessageRow = typeof schema.messages.$inferSelect

/** Fetch a live conversation the user may access. Admins may read (but not write) any conversation. */
export async function getConversation(
  user: UserRow,
  id: string,
  { allowAdminRead = false } = {},
): Promise<ConversationRow> {
  const row = await db.query.conversations.findFirst({
    where: and(eq(schema.conversations.id, id), isNull(schema.conversations.deletedAt)),
  })
  if (!row || (row.userId !== user.id && !(allowAdminRead && user.role === 'admin'))) throw notFound('Conversation')
  return row
}

export async function listMessages(conversationId: string): Promise<MessageRow[]> {
  return db
    .select()
    .from(schema.messages)
    .where(and(eq(schema.messages.conversationId, conversationId), isNull(schema.messages.deletedAt)))
    .orderBy(schema.messages.createdAt, schema.messages.id)
}

/**
 * Ordered root→leaf path ending at `leafId`, walking parent links in the database.
 * Throws if the leaf does not belong to the conversation.
 */
export async function loadPath(conversationId: string, leafId: string, tx: Tx | typeof db = db): Promise<MessageRow[]> {
  const result = await tx.execute<{ id: string; depth: number }>(sql`
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 0 AS depth FROM message
      WHERE id = ${leafId} AND conversation_id = ${conversationId} AND deleted_at IS NULL
      UNION ALL
      SELECT m.id, m.parent_id, chain.depth + 1 FROM message m
      JOIN chain ON m.id = chain.parent_id
      WHERE m.conversation_id = ${conversationId} AND m.deleted_at IS NULL AND chain.depth < 10000
    )
    SELECT id, depth FROM chain
  `)
  if (result.rows.length === 0) throw notFound('Message')
  const order = new Map(result.rows.map((r) => [r.id, r.depth]))
  const rows = await tx.query.messages.findMany({
    where: (m, { inArray }) => inArray(m.id, [...order.keys()]),
  })
  return rows.sort((a, b) => order.get(b.id)! - order.get(a.id)!)
}

export async function touchConversation(id: string, tx: Tx | typeof db = db): Promise<void> {
  await tx.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, id))
}

/**
 * Soft-delete one message and re-attach its children to its parent, so the rest of the
 * tree stays reachable. Rows are locked to serialize concurrent deletes in a conversation.
 */
export async function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const locked = await tx.execute<{ id: string; parent_id: string | null }>(sql`
      SELECT id, parent_id FROM message
      WHERE conversation_id = ${conversationId} AND deleted_at IS NULL
      FOR UPDATE
    `)
    const target = locked.rows.find((r) => r.id === messageId)
    if (!target) throw notFound('Message')
    await tx
      .update(schema.messages)
      .set({ parentId: target.parent_id })
      .where(and(eq(schema.messages.parentId, messageId), isNull(schema.messages.deletedAt)))
    await tx.update(schema.messages).set({ deletedAt: new Date() }).where(eq(schema.messages.id, messageId))
  })
}
