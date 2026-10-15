import { mcpCallSchema, mcpServerInputSchema, mcpServerPatchSchema } from '@flai/shared'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, schema } from '../db'
import { notFound } from '../lib/errors'
import { type AppEnv, body } from '../lib/hono'
import { newId } from '../lib/ids'
import { toMcpServer } from '../lib/serialize'
import { callServerTool, fetchServerTools } from '../llm/mcp'

const m = schema.mcpServers

async function ownedServer(userId: string, id: string) {
  const row = await db.query.mcpServers.findFirst({
    where: and(eq(m.id, id), eq(m.userId, userId), isNull(m.deletedAt)),
  })
  if (!row) throw notFound('MCP server')
  return row
}

export const mcpRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const rows = await db
      .select()
      .from(m)
      .where(and(eq(m.userId, c.get('user').id), isNull(m.deletedAt)))
      .orderBy(desc(m.createdAt))
    return c.json(rows.map(toMcpServer))
  })
  .post('/', async (c) => {
    const input = await body(c, mcpServerInputSchema)
    const [row] = await db
      .insert(m)
      .values({ id: newId(), userId: c.get('user').id, ...input })
      .returning()
    return c.json(toMcpServer(row!), 201)
  })
  .get('/:id', async (c) => c.json(toMcpServer(await ownedServer(c.get('user').id, c.req.param('id')))))
  .patch('/:id', async (c) => {
    const server = await ownedServer(c.get('user').id, c.req.param('id'))
    const input = await body(c, mcpServerPatchSchema)
    const [row] = await db.update(m).set(input).where(eq(m.id, server.id)).returning()
    return c.json(toMcpServer(row!))
  })
  .delete('/:id', async (c) => {
    const server = await ownedServer(c.get('user').id, c.req.param('id'))
    await db.update(m).set({ deletedAt: new Date() }).where(eq(m.id, server.id))
    return c.body(null, 204)
  })
  .post('/:id/refresh', async (c) => {
    const server = await ownedServer(c.get('user').id, c.req.param('id'))
    const tools = await fetchServerTools(server)
    const [row] = await db.update(m).set({ tools }).where(eq(m.id, server.id)).returning()
    return c.json(toMcpServer(row!))
  })
  .post('/:id/tools/:name/call', async (c) => {
    const server = await ownedServer(c.get('user').id, c.req.param('id'))
    const input = await body(c, mcpCallSchema)
    return c.json(await callServerTool(server, c.req.param('name'), input.arguments))
  })
