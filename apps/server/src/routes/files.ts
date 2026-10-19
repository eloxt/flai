import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { and, desc, eq, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { config } from '../config'
import { db, schema } from '../db'
import { badRequest, notFound } from '../lib/errors'
import type { AppEnv } from '../lib/hono'
import { newId } from '../lib/ids'
import { toFile } from '../lib/serialize'
import { deleteObject, publicUrl, putObject } from '../services/storage'

export const fileRoutes = new Hono<AppEnv>()
  .get('/files', async (c) => {
    const rows = await db
      .select()
      .from(schema.files)
      .where(eq(schema.files.userId, c.get('user').id))
      .orderBy(desc(schema.files.createdAt))
    return c.json(rows.map(toFile))
  })
  .post('/files', async (c) => {
    const user = c.get('user')
    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) throw badRequest('Multipart field "file" is required')
    if (file.size === 0) throw badRequest('File is empty')
    if (file.size > config().MAX_UPLOAD_BYTES) throw badRequest('File is too large')

    const bytes = new Uint8Array(await file.arrayBuffer())
    const hash = createHash('md5').update(bytes).digest('hex')
    const mediaType = file.type || 'application/octet-stream'
    const id = newId()

    // Identical content is stored once; a new row just points at the existing object.
    const existing = await db.query.files.findFirst({ where: eq(schema.files.hash, hash) })
    const storageKey = existing?.storageKey ?? `${user.id}/${id}${extname(file.name).toLowerCase()}`
    if (!existing) await putObject(storageKey, bytes, mediaType)

    const [row] = await db
      .insert(schema.files)
      .values({
        id,
        userId: user.id,
        hash,
        name: file.name || 'file',
        mediaType,
        size: file.size,
        storageKey,
        url: existing?.url ?? publicUrl(storageKey),
      })
      .returning()
    return c.json(toFile(row!), 201)
  })
  .delete('/files/:id', async (c) => {
    const user = c.get('user')
    const [row] = await db
      .delete(schema.files)
      .where(and(eq(schema.files.id, c.req.param('id')), eq(schema.files.userId, user.id)))
      .returning()
    if (!row) throw notFound('File')
    const stillUsed = await db.query.files.findFirst({
      where: and(eq(schema.files.storageKey, row.storageKey), ne(schema.files.id, row.id)),
    })
    if (!stillUsed) await deleteObject(row.storageKey).catch((error) => console.warn('failed to delete object', error))
    return c.body(null, 204)
  })
