import {
  createConversationSchema,
  generateTitleSchema,
  listConversationsQuerySchema,
  type SearchHit,
  updateConversationSchema,
} from '@flai/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db, schema } from '../db'
import { decodeCursor } from '../lib/cursor'
import { highlight } from '../lib/highlight'
import { type AppEnv, body, query } from '../lib/hono'
import { newId } from '../lib/ids'
import { toConversation, toMessage } from '../lib/serialize'
import { generateTitle } from '../llm/title'
import { activeGeneration, cancelConversationGeneration } from '../llm/generation'
import { deleteMessage, getConversation, listConversations, listMessages } from '../services/conversations'
import { searchChats } from '../services/search'

const c_ = schema.conversations
const SEARCH_LIMIT = 50

export const conversationRoutes = new Hono<AppEnv>()
  .get('/conversations', async (c) => {
    const user = c.get('user')
    const q = query(c, listConversationsQuerySchema)
    const page = await listConversations(user.id, { favourite: q.favourite, cursor: decodeCursor(q.cursor), limit: q.limit })
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
    const { rows, terms } = await searchChats(c.get('user').id, q, { limit: SEARCH_LIMIT })
    const hits: SearchHit[] = rows.map((r) => ({
      conversationId: r.conversation_id,
      title: r.title,
      icon: r.icon,
      createdAt: new Date(r.created_at).toISOString(),
      // A chat found by its summary alone has no matching message to quote.
      highlight: highlight(r.search_text || r.summary || '', terms),
    }))
    return c.json(hits)
  })
