import { changePasswordSchema, feedbackSchema, updateMeSchema, updateMemorySchema, updatePreferencesSchema } from '@flai/shared'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, schema } from '../db'
import { hashPassword, issueTokens, verifyPassword } from '../lib/auth'
import { AppError, badRequest, notFound } from '../lib/errors'
import { type AppEnv, body } from '../lib/hono'
import { toMemory, toMemoryEvent, toUser } from '../lib/serialize'
import { nudgeEmbeddingIndexer } from '../llm/embedding-index'
import { sendBark } from '../services/bark'
import { clearMemories, deleteMemory, listMemories, listMemoryEvents, undoMemoryEvent, updateMemory } from '../services/memories'
import { getSetting } from '../services/settings'

export const meRoutes = new Hono<AppEnv>()
  .get('/me', (c) => c.json(toUser(c.get('user'))))
  .patch('/me', async (c) => {
    const user = c.get('user')
    const input = await body(c, updateMeSchema)
    const patch: Partial<typeof schema.users.$inferInsert> = {}
    if (input.username !== undefined) patch.username = input.username
    if (input.avatarFileId === null) patch.avatar = null
    if (input.avatarFileId) {
      const file = await db.query.files.findFirst({
        where: and(eq(schema.files.id, input.avatarFileId), eq(schema.files.userId, user.id)),
      })
      if (!file) throw badRequest('Avatar file not found')
      if (!file.mediaType.startsWith('image/')) throw badRequest('Avatar must be an image')
      patch.avatar = file.url
    }
    if (Object.keys(patch).length === 0) return c.json(toUser(user))
    const [updated] = await db.update(schema.users).set(patch).where(eq(schema.users.id, user.id)).returning()
    return c.json(toUser(updated!))
  })
  .patch('/me/preferences', async (c) => {
    const user = c.get('user')
    const input = await body(c, updatePreferencesSchema)
    const preferences = { ...user.preferences, ...input }
    const [updated] = await db.update(schema.users).set({ preferences }).where(eq(schema.users.id, user.id)).returning()
    return c.json(updated!.preferences)
  })
  .get('/me/memories', async (c) => c.json((await listMemories(c.get('user').id)).map(toMemory)))
  .patch('/me/memories/:id', async (c) => {
    const input = await body(c, updateMemorySchema)
    const row = await updateMemory(c.get('user').id, c.req.param('id'), input)
    nudgeEmbeddingIndexer()
    if (!row) throw notFound('Memory')
    return c.json(toMemory(row))
  })
  .delete('/me/memories/:id', async (c) => {
    if (!(await deleteMemory(c.get('user').id, c.req.param('id')))) throw notFound('Memory')
    return c.body(null, 204)
  })
  .delete('/me/memories', async (c) => {
    await clearMemories(c.get('user').id)
    return c.body(null, 204)
  })
  .get('/me/memory-events', async (c) => c.json((await listMemoryEvents(c.get('user').id)).map(toMemoryEvent)))
  .post('/me/memory-events/:id/undo', async (c) => {
    await undoMemoryEvent(c.get('user').id, c.req.param('id'))
    nudgeEmbeddingIndexer()
    return c.body(null, 204)
  })
  .put('/me/password', async (c) => {
    const user = c.get('user')
    const input = await body(c, changePasswordSchema)
    if (!(await verifyPassword(input.oldPassword, user.passwordHash))) {
      throw new AppError('VALIDATION', 'Current password is incorrect')
    }
    const passwordHash = await hashPassword(input.newPassword)
    const [updated] = await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, user.id)).returning()
    // Every previous token is now invalid; hand back a fresh pair for this session.
    return c.json({ tokens: await issueTokens(updated!) })
  })
  .post('/feedback', async (c) => {
    const user = c.get('user')
    const input = await body(c, feedbackSchema)
    const { barkUrl } = getSetting('error_alert')
    if (!barkUrl) throw new AppError('NOT_CONFIGURED', 'Feedback channel is not configured')
    try {
      await sendBark(barkUrl, 'Flai 用户反馈', `用户：${user.username} (${user.id})\n\n${input.content}`)
    } catch (error) {
      throw new AppError('UPSTREAM', (error as Error).message)
    }
    return c.body(null, 204)
  })
