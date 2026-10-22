import { createShareSchema, type MessageRecord, type PublicShare, type Share, updateShareSchema } from '@flai/shared'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, schema } from '../db'
import { notFound } from '../lib/errors'
import { type AppEnv, body, query, type UserRow } from '../lib/hono'
import { newId } from '../lib/ids'
import { toMessage } from '../lib/serialize'
import { getConversation, loadPath } from '../services/conversations'
import { imageProxyQuerySchema, proxyImage } from '../services/image-proxy'
import { IMAGE_SEARCH_HOSTS, imageSearchQuerySchema, searchImages } from '../services/image-search'

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

const snapshotHasText = (messages: MessageRecord[], text: string) =>
  messages.some((message) => message.parts.some((part) => part.type === 'text' && part.text.includes(text)))

/** Searched photos are not in the snapshot text; they come from the search hosts for a SearchImage in it. */
const isSearchedImage = (messages: MessageRecord[], url: string) =>
  IMAGE_SEARCH_HOSTS.has(new URL(url).hostname) && snapshotHasText(messages, 'SearchImage(')

async function activeShare(id: string): Promise<ShareRow> {
  const row = await db.query.shares.findFirst({
    where: and(eq(schema.shares.id, id), isNull(schema.shares.deletedAt)),
  })
  if (!row || isExpired(row)) throw notFound('Share')
  return row
}

export const publicShareRoutes = new Hono().get('/shares/:id/images', async (c) => {
  const { url } = query(c, imageProxyQuerySchema)
  const messages = (await activeShare(c.req.param('id'))).messages as MessageRecord[]
  if (!snapshotHasUrl(messages, url) && !isSearchedImage(messages, url)) throw notFound('Image')
  return proxyImage(url, c.req.raw.signal)
}).get('/shares/:id/image-search', async (c) => {
  const { q } = query(c, imageSearchQuerySchema)
  // Only queries the shared answer itself asks for, so the share is not an open search proxy.
  if (!snapshotHasText((await activeShare(c.req.param('id'))).messages as MessageRecord[], q)) throw notFound('Image search')
  return c.json({ images: await searchImages(q, c.req.raw.signal) })
}).get('/shares/:id', async (c) => {
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
