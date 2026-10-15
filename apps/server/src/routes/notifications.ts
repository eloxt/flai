import { type Notification, notificationInputSchema } from '@flai/shared'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, schema } from '../db'
import { notFound } from '../lib/errors'
import { type AppEnv, body } from '../lib/hono'
import { newId } from '../lib/ids'

const toNotification = (row: typeof schema.notifications.$inferSelect): Notification => ({
  id: row.id,
  title: row.title,
  content: row.content,
  level: row.level,
  createdAt: row.createdAt.toISOString(),
})

const list = async () =>
  (await db.select().from(schema.notifications).orderBy(desc(schema.notifications.createdAt))).map(toNotification)

export const notificationRoutes = new Hono<AppEnv>().get('/notifications', async (c) => c.json(await list()))

export const adminNotificationRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await list()))
  .post('/', async (c) => {
    const input = await body(c, notificationInputSchema)
    const [row] = await db.insert(schema.notifications).values({ id: newId(), ...input }).returning()
    return c.json(toNotification(row!), 201)
  })
  .patch('/:id', async (c) => {
    const input = await body(c, notificationInputSchema.partial())
    const [row] = await db
      .update(schema.notifications)
      .set(input)
      .where(eq(schema.notifications.id, c.req.param('id')))
      .returning()
    if (!row) throw notFound('Notification')
    return c.json(toNotification(row))
  })
  .delete('/:id', async (c) => {
    const [row] = await db.delete(schema.notifications).where(eq(schema.notifications.id, c.req.param('id'))).returning()
    if (!row) throw notFound('Notification')
    return c.body(null, 204)
  })
