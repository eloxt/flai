import { createShareSchema, type MessageRecord, updateShareSchema } from '@flai/shared'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, schema } from '../db'
import { notFound } from '../lib/errors'
import { type AppEnv, body, query, type UserRow } from '../lib/hono'
import { newId } from '../lib/ids'
import { toMessage, toPublicShare, toShare } from '../lib/serialize'
import { getConversation, loadPath } from '../services/conversations'
import { imageProxyQuerySchema, proxyImage } from '../services/image-proxy'

type ShareRow = typeof schema.shares.$inferSelect

const isExpired = (row: ShareRow) => row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()

async function snapshot(user: UserRow, conversationId: string, leafMessageId: string) {
  const conversation = await getConversation(user, conversationId)
  const path = await loadPath(conversation.id, leafMessageId)
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
    const snap = await snapshot(user, input.conversationId, input.leafMessageId)
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
    if (input.leafMessageId) Object.assign(patch, await snapshot(user, share.conversationId, input.leafMessageId))
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

// http(s) or protocol-relative URLs; quotes, backslashes and whitespace end a URL in markdown and openui-lang.
const URL_IN_TEXT = /(?:https?:\/\/|(?<![\w+.-]:)\/\/)[^\s"'<>`\\]+/gi
const TRAILING_PUNCTUATION = /[)\]}.,;:!?*_~]$/

function normalizeUrl(raw: string): string | undefined {
  try {
    return new URL(raw.startsWith('//') ? `https:${raw}` : raw).href
  } catch {
    return undefined
  }
}

/**
 * Whether a URL appears in the snapshot's text. URLs are compared after normalisation, matching
 * the client (which resolves protocol-relative sources), and must be whole URLs, not fragments.
 */
function snapshotHasUrl(messages: MessageRecord[], url: string): boolean {
  const target = normalizeUrl(url)
  if (!target) return false
  return messages.some((message) => message.parts.some((part) => {
    if (part.type !== 'text') return false
    for (const [match] of part.text.matchAll(URL_IN_TEXT)) {
      // Markdown wraps URLs in brackets and prose follows them with punctuation.
      for (let candidate = match; candidate; candidate = candidate.slice(0, -1)) {
        if (normalizeUrl(candidate) === target) return true
        if (!TRAILING_PUNCTUATION.test(candidate)) break
      }
    }
    return false
  }))
}

/** A share anyone with the link may view: not deleted and not expired. */
async function publicShare(id: string): Promise<ShareRow> {
  const row = await db.query.shares.findFirst({ where: and(eq(schema.shares.id, id), isNull(schema.shares.deletedAt)) })
  if (!row || isExpired(row)) throw notFound('Share')
  return row
}

export const publicShareRoutes = new Hono().get('/shares/:id/images', async (c) => {
  const { url } = query(c, imageProxyQuerySchema)
  const row = await publicShare(c.req.param('id'))
  if (!snapshotHasUrl(row.messages as MessageRecord[], url)) throw notFound('Image')
  return proxyImage(url, c.req.raw.signal)
}).get('/shares/:id', async (c) => {
  const row = await publicShare(c.req.param('id'))
  return c.json(toPublicShare(row))
})
