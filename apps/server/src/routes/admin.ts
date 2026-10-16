import {
  type AdminProvider,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  pageQuerySchema,
  providerInputSchema,
  providerOrderSchema,
  providerPatchSchema,
  SETTING_KEYS,
  type SettingKey,
  settingSchemas,
} from '@flai/shared'
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, schema } from '../db'
import { hashPassword } from '../lib/auth'
import { decodeCursor, paginate } from '../lib/cursor'
import { isUniqueViolation } from '../lib/db-errors'
import { AppError, badRequest, notFound } from '../lib/errors'
import { type AppEnv, body, query } from '../lib/hono'
import { newId } from '../lib/ids'
import { toConversation, toUser } from '../lib/serialize'
import { maskKey, type ProviderRow, reloadProviders, resolveModel } from '../services/providers'
import { getSetting, updateSetting } from '../services/settings'
import { adminNotificationRoutes } from './notifications'

const toAdminProvider = (p: ProviderRow): AdminProvider => ({
  id: p.id,
  name: p.name,
  type: p.type,
  logo: p.logo,
  models: p.models,
  baseUrl: p.baseUrl,
  apiKey: maskKey(p.apiKey),
  isActive: p.isActive,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
})

const u = schema.users
const p = schema.providers

async function liveUser(id: string) {
  const row = await db.query.users.findFirst({ where: and(eq(u.id, id), isNull(u.deletedAt)) })
  if (!row) throw notFound('User')
  return row
}

async function liveProvider(id: string) {
  const row = await db.query.providers.findFirst({ where: and(eq(p.id, id), isNull(p.deletedAt)) })
  if (!row) throw notFound('Provider')
  return row
}

async function ensureEmailFree(email: string, exceptId?: string) {
  const clash = await db.query.users.findFirst({
    where: and(sql`lower(btrim(${u.email})) = ${email}`, isNull(u.deletedAt), exceptId ? ne(u.id, exceptId) : undefined),
  })
  if (clash) throw new AppError('CONFLICT', 'Email is already registered')
}

function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as string[]).includes(key)
}

const userRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const rows = await db.select().from(u).where(isNull(u.deletedAt)).orderBy(desc(u.createdAt))
    return c.json(rows.map(toUser))
  })
  .post('/', async (c) => {
    const input = await body(c, adminCreateUserSchema)
    await ensureEmailFree(input.email)
    const { password, ...rest } = input
    try {
      const [row] = await db
        .insert(u)
        .values({ id: newId(), ...rest, passwordHash: await hashPassword(password) })
        .returning()
      return c.json(toUser(row!), 201)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError('CONFLICT', 'Email is already registered')
      throw error
    }
  })
  .get('/:id', async (c) => c.json(toUser(await liveUser(c.req.param('id')))))
  .patch('/:id', async (c) => {
    const target = await liveUser(c.req.param('id'))
    const input = await body(c, adminUpdateUserSchema)
    if (input.email) await ensureEmailFree(input.email, target.id)
    const { password, ...rest } = input
    const patch: Partial<typeof u.$inferInsert> = { ...rest }
    if (password) patch.passwordHash = await hashPassword(password)
    const [row] = await db.update(u).set(patch).where(eq(u.id, target.id)).returning()
    return c.json(toUser(row!))
  })
  .delete('/:id', async (c) => {
    const target = await liveUser(c.req.param('id'))
    if (target.id === c.get('user').id) throw badRequest('You cannot delete your own account')
    await db.update(u).set({ deletedAt: new Date() }).where(eq(u.id, target.id))
    return c.body(null, 204)
  })
  .get('/:id/conversations', async (c) => {
    const target = await liveUser(c.req.param('id'))
    const q = query(c, pageQuerySchema)
    const cursor = decodeCursor(q.cursor)
    const cv = schema.conversations
    const rows = await db
      .select()
      .from(cv)
      .where(
        and(
          eq(cv.userId, target.id),
          isNull(cv.deletedAt),
          cursor ? or(lt(cv.createdAt, cursor.at), and(eq(cv.createdAt, cursor.at), lt(cv.id, cursor.id))) : undefined,
        ),
      )
      .orderBy(desc(cv.createdAt), desc(cv.id))
      .limit(q.limit + 1)
    const page = paginate(rows, q.limit, (r) => [r.createdAt, r.id])
    return c.json({ items: page.items.map(toConversation), nextCursor: page.nextCursor })
  })

const providerRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const rows = await db.select().from(p).where(isNull(p.deletedAt)).orderBy(p.sortOrder, p.createdAt, p.id)
    return c.json(rows.map(toAdminProvider))
  })
  .post('/', async (c) => {
    const input = await body(c, providerInputSchema)
    const [row] = await db.insert(p).values({
      id: newId(),
      ...input,
      sortOrder: sql`(select coalesce(max(${p.sortOrder}), -1) + 1 from ${p} where ${p.deletedAt} is null)`,
    }).returning()
    await reloadProviders()
    return c.json(toAdminProvider(row!), 201)
  })
  .put('/order', async (c) => {
    const { ids } = await body(c, providerOrderSchema)
    await db.transaction(async (tx) => {
      const rows = await tx.select({ id: p.id }).from(p).where(isNull(p.deletedAt)).orderBy(p.id).for('update')
      const currentIds = new Set(rows.map((row) => row.id))
      if (ids.length !== rows.length || ids.some((id) => !currentIds.has(id))) {
        throw badRequest('Provider list has changed; reload it before reordering')
      }
      if (ids.length === 0) return
      await tx.update(p).set({
        sortOrder: sql`case ${p.id} ${sql.join(ids.map((id, index) => sql`when ${id} then ${index}::integer`), sql` `)} end`,
      }).where(inArray(p.id, ids))
    })
    await reloadProviders()
    return c.body(null, 204)
  })
  .get('/:id', async (c) => c.json(toAdminProvider(await liveProvider(c.req.param('id')))))
  .patch('/:id', async (c) => {
    const current = await liveProvider(c.req.param('id'))
    const input = await body(c, providerPatchSchema)
    // The masked key is echoed back by the edit form; only a different value replaces it.
    if (input.apiKey === maskKey(current.apiKey)) delete input.apiKey
    const [row] = await db.update(p).set(input).where(eq(p.id, current.id)).returning()
    await reloadProviders()
    return c.json(toAdminProvider(row!))
  })
  .delete('/:id', async (c) => {
    const current = await liveProvider(c.req.param('id'))
    await db.update(p).set({ deletedAt: new Date() }).where(eq(p.id, current.id))
    await reloadProviders()
    return c.body(null, 204)
  })

const settingRoutes = new Hono<AppEnv>()
  .get('/:key', (c) => {
    const key = c.req.param('key')
    if (!isSettingKey(key)) throw notFound('Setting')
    return c.json(getSetting(key))
  })
  .put('/:key', async (c) => {
    const key = c.req.param('key')
    if (!isSettingKey(key)) throw notFound('Setting')
    const input = await body(c, settingSchemas[key].partial())
    if (key === 'title_generation') {
      const merged = { ...getSetting('title_generation'), ...input } as ReturnType<typeof getSetting<'title_generation'>>
      if (merged.providerId || merged.modelId) resolveModel(merged.providerId, merged.modelId)
    }
    return c.json(await updateSetting(key, input))
  })

export const adminRoutes = new Hono<AppEnv>()
  .route('/users', userRoutes)
  .route('/providers', providerRoutes)
  .route('/settings', settingRoutes)
  .route('/notifications', adminNotificationRoutes)
