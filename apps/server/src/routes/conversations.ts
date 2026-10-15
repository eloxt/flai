import {
  createConversationSchema,
  generateTitleSchema,
  listConversationsQuerySchema,
  type SearchHit,
  updateConversationSchema,
} from '@flai/shared'
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db, schema } from '../db'
import { decodeCursor, paginate } from '../lib/cursor'
import { highlight } from '../lib/highlight'
import { type AppEnv, body, query } from '../lib/hono'
import { newId } from '../lib/ids'
import { toConversation, toMessage } from '../lib/serialize'
import { generateTitle } from '../llm/title'
import { activeGeneration, cancelConversationGeneration } from '../llm/generation'
import { deleteMessage, getConversation, listMessages } from '../services/conversations'

const c_ = schema.conversations

export const conversationRoutes = new Hono<AppEnv>()
  .get('/conversations', async (c) => {
    const user = c.get('user')
    const q = query(c, listConversationsQuerySchema)
    const cursor = decodeCursor(q.cursor)
    // Favourites are listed by recent activity; the main list by creation time.
    const sortCol = q.favourite ? c_.updatedAt : c_.createdAt
    const rows = await db
      .select()
      .from(c_)
      .where(
        and(
          eq(c_.userId, user.id),
          isNull(c_.deletedAt),
          q.favourite === undefined ? undefined : eq(c_.favourite, q.favourite),
          cursor ? or(lt(sortCol, cursor.at), and(eq(sortCol, cursor.at), lt(c_.id, cursor.id))) : undefined,
        ),
      )
      .orderBy(desc(sortCol), desc(c_.id))
      .limit(q.limit + 1)
    const page = paginate(rows, q.limit, (r) => [q.favourite ? r.updatedAt : r.createdAt, r.id])
    return c.json({ items: page.items.map(toConversation), nextCursor: page.nextCursor })
  })
  .post('/conversations', async (c) => {
    const input = await body(c, createConversationSchema)
    const [row] = await db
      .insert(c_)
      .values({ id: newId(), userId: c.get('user').id, title: input.title ?? '' })
      .returning()
    return c.json(toConversation(row!), 201)
  })
  .get('/conversations/:id', async (c) => {
    const conversation = await getConversation(c.get('user'), c.req.param('id'), { allowAdminRead: true })
    const [messages, active] = await Promise.all([
      listMessages(conversation.id),
      // Lets the owner's client re-attach to a reply that is still being written.
      conversation.userId === c.get('user').id ? activeGeneration(conversation.id) : null,
    ])
    return c.json({ ...toConversation(conversation), messages: messages.map(toMessage), activeGeneration: active })
  })
  .patch('/conversations/:id', async (c) => {
    const conversation = await getConversation(c.get('user'), c.req.param('id'))
    const input = await body(c, updateConversationSchema)
    const [row] = await db.update(c_).set(input).where(eq(c_.id, conversation.id)).returning()
    return c.json(toConversation(row!))
  })
  .delete('/conversations/:id', async (c) => {
    const conversation = await getConversation(c.get('user'), c.req.param('id'))
    await cancelConversationGeneration(conversation.id)
    const now = new Date()
    await db.transaction(async (tx) => {
      await tx.update(c_).set({ deletedAt: now }).where(eq(c_.id, conversation.id))
      await tx
        .update(schema.messages)
        .set({ deletedAt: now })
        .where(and(eq(schema.messages.conversationId, conversation.id), isNull(schema.messages.deletedAt)))
    })
    return c.body(null, 204)
  })
  .post('/conversations/:id/title', async (c) => {
    const conversation = await getConversation(c.get('user'), c.req.param('id'))
    const input = await body(c, generateTitleSchema)
    const result = await generateTitle(conversation.id, input.content)
    const [row] = await db.update(c_).set(result).where(eq(c_.id, conversation.id)).returning()
    return c.json(toConversation(row!))
  })
  .delete('/conversations/:id/messages/:messageId', async (c) => {
    const conversation = await getConversation(c.get('user'), c.req.param('id'))
    // A reply still answering the deleted message would be saved under a deleted parent.
    await cancelConversationGeneration(conversation.id, { parentIds: [c.req.param('messageId')] })
    await deleteMessage(conversation.id, c.req.param('messageId'))
    return c.body(null, 204)
  })
  .get('/search', async (c) => {
    const { q } = query(c, z.object({ q: z.string().trim().min(1).max(200) }))
    const tsq = sql`websearch_to_tsquery('zhcfg', ${q})`
    const [result, termRows] = await Promise.all([
      db.execute<{
        conversation_id: string
        message_id: string
        title: string
        icon: string | null
        created_at: Date
        search_text: string
      }>(sql`
        SELECT DISTINCT ON (m.conversation_id)
          m.conversation_id, m.id AS message_id, cv.title, cv.icon, cv.created_at, m.search_text
        FROM message m
        JOIN conversation cv ON cv.id = m.conversation_id
        WHERE m.tsv @@ ${tsq}
          AND cv.user_id = ${c.get('user').id}
          AND cv.deleted_at IS NULL AND m.deleted_at IS NULL
        ORDER BY m.conversation_id, ts_rank(m.tsv, ${tsq}) DESC
        LIMIT 50
      `),
      db.execute<{ term: string }>(sql`SELECT unnest(tsvector_to_array(to_tsvector('zhcfg', ${q}))) AS term`),
    ])
    const terms = termRows.rows.map((r) => r.term)
    const hits: SearchHit[] = result.rows
      .map((r) => ({
        conversationId: r.conversation_id,
        messageId: r.message_id,
        title: r.title,
        icon: r.icon,
        createdAt: new Date(r.created_at).toISOString(),
        highlight: highlight(r.search_text, terms),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return c.json(hits)
  })
