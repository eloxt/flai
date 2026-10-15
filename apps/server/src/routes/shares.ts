import { createShareSchema, type MessageRecord, type PublicShare, type Share, updateShareSchema } from '@flai/shared'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, schema } from '../db'
import { notFound } from '../lib/errors'
import { type AppEnv, body } from '../lib/hono'
import { newId } from '../lib/ids'
import { toMessage } from '../lib/serialize'
import { getConversation, loadPath } from '../services/conversations'

type ShareRow = typeof schema.shares.$inferSelect

const toShare = (row: ShareRow): Share => ({
  id: row.id,
  conversationId: row.conversationId,
  title: row.conversation.title,
  icon: row.conversation.icon,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt?.toISOString() ?? null,
})

const isExpired = (row: ShareRow) => row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()

async function snapshot(userId: string, conversationId: string, leafMessageId: string) {
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(schema.conversations.id, conversationId),
      eq(schema.conversations.userId, userId),
      isNull(schema.conversations.deletedAt),
    ),
  })
  if (!conversation) throw notFound('Conversation')
  const path = await loadPath(conversationId, leafMessageId)
  return {
    conversation: { title: conversation.title, icon: conversation.icon },
    messages: path.map(toMessage),
  }
}

async function ownedShare(userId: string, id: string): Promise<ShareRow> {
  const row = await db.query.shares.findFirst({
    where: and(eq(schema.shares.id, id), eq(schema.shares.userId, userId), isNull(schema.shares.deletedAt)),
  })
  if (!row) throw notFound('Share')
  return row
}

export const shareRoutes = new Hono<AppEnv>()
  .get('/shares', async (c) => {
    const rows = await db
      .select()
      .from(schema.shares)
      .where(and(eq(schema.shares.userId, c.get('user').id), isNull(schema.shares.deletedAt)))
      .orderBy(desc(schema.shares.createdAt))
    return c.json(rows.map(toShare))
  })
  .post('/shares', async (c) => {
    const user = c.get('user')
    const input = await body(c, createShareSchema)
    const snap = await snapshot(user.id, input.conversationId, input.leafMessageId)
    const [row] = await db
      .insert(schema.shares)
      .values({
        id: newId(),
        userId: user.id,
        conversationId: input.conversationId,
        ...snap,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .returning()
    return c.json(toShare(row!), 201)
  })
  .patch('/shares/:id', async (c) => {
    const user = c.get('user')
    const share = await ownedShare(user.id, c.req.param('id'))
    const input = await body(c, updateShareSchema)
    const patch: Partial<typeof schema.shares.$inferInsert> = {}
    if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
    if (input.leafMessageId) Object.assign(patch, await snapshot(user.id, share.conversationId, input.leafMessageId))
    if (Object.keys(patch).length === 0) return c.json(toShare(share))
    const [row] = await db.update(schema.shares).set(patch).where(eq(schema.shares.id, share.id)).returning()
    return c.json(toShare(row!))
  })
  .delete('/shares/:id', async (c) => {
    const share = await ownedShare(c.get('user').id, c.req.param('id'))
    await db.update(schema.shares).set({ deletedAt: new Date() }).where(eq(schema.shares.id, share.id))
    return c.body(null, 204)
  })
  .get('/conversations/:id/share', async (c) => {
    const user = c.get('user')
    const conversation = await getConversation(user, c.req.param('id'))
    const row = await db.query.shares.findFirst({
      where: and(eq(schema.shares.conversationId, conversation.id), isNull(schema.shares.deletedAt)),
      orderBy: desc(schema.shares.createdAt),
    })
    return c.json(row ? toShare(row) : null)
  })

export const publicShareRoutes = new Hono().get('/shares/:id', async (c) => {
  const row = await db.query.shares.findFirst({
    where: and(eq(schema.shares.id, c.req.param('id')), isNull(schema.shares.deletedAt)),
  })
  if (!row || isExpired(row)) throw notFound('Share')
  const result: PublicShare = {
    id: row.id,
    title: row.conversation.title,
    icon: row.conversation.icon,
    messages: row.messages as MessageRecord[],
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }
  return c.json(result)
})
