/**
 * End-to-end API tests against a real PostgreSQL (with zhparser) and an in-process mock LLM.
 * Runs only when FLAI_TEST_DATABASE_URL points at a server where we may create databases, e.g.
 *   FLAI_TEST_DATABASE_URL=postgres://flai:flai@127.0.0.1:55432/flai pnpm test
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ADMIN_URL = process.env.FLAI_TEST_DATABASE_URL
const suite = ADMIN_URL ? describe : describe.skip

type App = { request: (path: string, init?: RequestInit) => Response | Promise<Response> }

suite('API integration', () => {
  const dbName = `flai_test_${Date.now()}`
  let app: App
  let llm: Server
  let llmUrl = ''
  let teardown: () => Promise<void> = async () => {}

  beforeAll(async () => {
    const pg = (await import('pg')).default
    const admin = new pg.Client({ connectionString: ADMIN_URL })
    await admin.connect()
    await admin.query(`CREATE DATABASE ${dbName}`)
    await admin.end()

    llm = createServer(async (req, res) => {
      let raw = ''
      for await (const c of req) raw += c
      const body = JSON.parse(raw || '{}')
      const last = JSON.stringify(body.messages?.at(-1)?.content ?? '')
      if (!body.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 1, model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: '{"icon":"🧪","title":"T"}' }, finish_reason: 'stop' }] }))
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const chunk = (delta: object, finish: string | null = null) =>
        res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
      chunk({ role: 'assistant', content: `echo:${last.length}` })
      // "slow" prompts stream for a while, so tests can stop or join a reply mid-way.
      if (last.includes('slow')) {
        for (let i = 0; i < 40 && !res.destroyed; i++) {
          chunk({ content: ' more' })
          await new Promise((r) => setTimeout(r, 25))
        }
      }
      chunk({}, 'stop')
      res.end('data: [DONE]\n\n')
    })
    await new Promise<void>((r) => llm.listen(0, '127.0.0.1', r))
    llmUrl = `http://127.0.0.1:${(llm.address() as AddressInfo).port}/v1`

    const url = new URL(ADMIN_URL!)
    url.pathname = `/${dbName}`
    process.env.DATABASE_URL = url.toString()
    process.env.NODE_ENV = 'test'
    const { db, pool } = await import('../src/db')
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname })
    const { createApp } = await import('../src/app')
    await (await import('../src/services/settings')).loadSettings()
    await (await import('../src/services/providers')).reloadProviders()
    app = createApp()

    teardown = async () => {
      await (await import('../src/llm/generation')).shutdownGenerations()
      await pool.end()
      llm.close()
      const cleanup = new pg.Client({ connectionString: ADMIN_URL })
      await cleanup.connect()
      await cleanup.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
      await cleanup.end()
    }
  }, 60_000)

  afterAll(() => teardown())

  const call = async (path: string, init: { method?: string; body?: unknown; token?: string } = {}) => {
    const res = await app.request(`/api/v1${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
    const text = await res.text()
    let data: any = text
    try {
      data = JSON.parse(text)
    } catch {
      // stream or empty body
    }
    return { status: res.status, data, text }
  }

  async function activateAndLogin(email: string, role: 'user' | 'admin' = 'user') {
    const reg = await call('/auth/register', { body: { email, username: email.split('@')[0]!.padEnd(5, 'x'), password: 'password123' } })
    expect(reg.status).toBe(201)
    const { db, schema } = await import('../src/db')
    const { eq } = await import('drizzle-orm')
    await db.update(schema.users).set({ isActive: true, role }).where(eq(schema.users.id, reg.data.user.id))
    const login = await call('/auth/login', { body: { email, password: 'password123' } })
    expect(login.status).toBe(200)
    return login.data.tokens.accessToken as string
  }

  let admin = ''
  let alice = ''
  let bob = ''
  let providerId = ''

  it('rejects inactive accounts and accepts activated ones', async () => {
    await call('/auth/register', { body: { email: 'pending@example.com', username: 'pending', password: 'password123' } })
    const login = await call('/auth/login', { body: { email: 'PENDING@example.com ', password: 'password123' } })
    expect(login.data.error.code).toBe('USER_INACTIVE')
    admin = await activateAndLogin('admin@example.com', 'admin')
    alice = await activateAndLogin('alice@example.com')
    bob = await activateAndLogin('bobby@example.com')
    expect((await call('/admin/users', { token: alice })).status).toBe(403)
  })

  it('lets admins configure providers', async () => {
    const res = await call('/admin/providers', {
      token: admin,
      body: { name: 'Mock', type: 'openai_completion', apiKey: 'sk-secret-key', baseUrl: llmUrl, models: [{ id: 'm1', name: 'M1' }] },
    })
    expect(res.status).toBe(201)
    expect(res.data.apiKey).not.toContain('secret')
    providerId = res.data.id
    const models = await call('/models', { token: alice })
    expect(models.data[0].models[0].id).toBe('m1')
    expect(JSON.stringify(models.data)).not.toContain('sk-secret')
  })

  it('persists provider order, appends new providers, and rejects invalid orders', async () => {
    const second = await call('/admin/providers', {
      token: admin, body: { name: 'Second', type: 'openai', apiKey: 'sk-second-key', models: [] },
    })
    const inactive = await call('/admin/providers', {
      token: admin, body: { name: 'Inactive', type: 'openai', apiKey: 'sk-inactive-key', isActive: false, models: [] },
    })
    const ids = [inactive.data.id, second.data.id, providerId]
    expect((await call('/admin/providers/order', { token: alice, method: 'PUT', body: { ids } })).status).toBe(403)
    expect((await call('/admin/providers/order', { token: admin, method: 'PUT', body: { ids: [providerId, providerId, second.data.id] } })).status).toBe(422)
    for (const invalid of [[providerId], [providerId, second.data.id, 'missing']]) {
      expect((await call('/admin/providers/order', { token: admin, method: 'PUT', body: { ids: invalid } })).status).toBe(400)
    }
    expect((await call('/admin/providers/order', { token: admin, method: 'PUT', body: { ids } })).status).toBe(204)
    await (await import('../src/services/providers')).reloadProviders()
    expect((await call('/admin/providers', { token: admin })).data.map((p: any) => p.id)).toEqual(ids)
    expect((await call('/models', { token: alice })).data.map((p: any) => p.id)).toEqual([second.data.id, providerId])
    const third = await call('/admin/providers', {
      token: admin, body: { name: 'Third', type: 'openai', apiKey: 'sk-third-key', models: [] },
    })
    expect((await call('/admin/providers', { token: admin })).data.map((p: any) => p.id)).toEqual([...ids, third.data.id])
    await call(`/admin/providers/${second.data.id}`, { token: admin, method: 'DELETE' })
    await call(`/admin/providers/${inactive.data.id}`, { token: admin, method: 'DELETE' })
    await call(`/admin/providers/${third.data.id}`, { token: admin, method: 'DELETE' })
    expect((await call('/admin/providers/order', { token: admin, method: 'PUT', body: { ids } })).status).toBe(400)
    expect((await call('/models', { token: alice })).data.map((p: any) => p.id)).toEqual([providerId])
  })

  let conversationId = ''
  let u1 = ''
  let a1 = ''

  it('streams a reply and persists both messages', async () => {
    conversationId = (await call('/conversations', { token: alice, body: {} })).data.id
    u1 = crypto.randomUUID()
    a1 = crypto.randomUUID()
    const res = await call(`/conversations/${conversationId}/messages`, {
      token: alice,
      body: { message: { id: u1, parentId: null, text: '你好 世界 searchable', fileIds: [] }, assistantId: a1, model: { providerId, modelId: 'm1' } },
    })
    expect(res.text).toContain('"type":"finish"')
    const detail = await call(`/conversations/${conversationId}`, { token: alice })
    expect(detail.data.messages.map((m: any) => [m.id, m.parentId])).toEqual([
      [u1, null],
      [a1, u1],
    ])
  })

  it('replays a finished reply from any position and treats a late stop as done', async () => {
    const full = await call(`/generations/${a1}/stream`, { token: alice })
    expect(full.status).toBe(200)
    const ids = [...full.text.matchAll(/^id: (.+)$/gm)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(1)
    expect(full.text).toContain('"type":"finish"')
    const rest = await call(`/generations/${a1}/stream?after=${ids[0]}`, { token: alice })
    expect([...rest.text.matchAll(/^id: (.+)$/gm)].map((m) => m[1])).toEqual(ids.slice(1))
    expect((await call(`/generations/${a1}/stream`, { token: bob })).status).toBe(404)
    expect((await call(`/generations/${a1}/stream?after=nope`, { token: alice })).status).toBe(400)
    expect((await call(`/generations/${a1}/cancel`, { method: 'POST', token: alice })).status).toBe(204)
    expect((await call(`/generations/${a1}/cancel`, { method: 'POST', token: bob })).status).toBe(404)
    expect((await call(`/conversations/${conversationId}`, { token: alice })).data.activeGeneration).toBeNull()
  })

  it('stops a running reply on request and keeps what was written', async () => {
    const u = crypto.randomUUID()
    const a = crypto.randomUUID()
    const pending = call(`/conversations/${conversationId}/messages`, {
      token: alice,
      body: { message: { id: u, parentId: a1, text: 'slow please', fileIds: [] }, assistantId: a, model: { providerId, modelId: 'm1' } },
    })
    await expect
      .poll(async () => (await call(`/conversations/${conversationId}`, { token: alice })).data.activeGeneration?.assistantId, { timeout: 5_000 })
      .toBe(a)
    await new Promise((r) => setTimeout(r, 200))
    expect((await call(`/generations/${a}/cancel`, { method: 'POST', token: alice })).status).toBe(204)
    const res = await pending
    expect(res.text).toContain('"type":"finish"')
    const detail = (await call(`/conversations/${conversationId}`, { token: alice })).data
    expect(detail.activeGeneration).toBeNull()
    const saved = detail.messages.find((m: any) => m.id === a)
    expect(saved.metadata.aborted).toBe(true)
    expect(saved.parts.length).toBeGreaterThan(0)
  })

  it('creates a sibling branch on regenerate and re-parents children on delete', async () => {
    const a2 = crypto.randomUUID()
    await call(`/conversations/${conversationId}/messages/${u1}/regenerate`, { token: alice, body: { assistantId: a2, model: { providerId, modelId: 'm1' } } })
    const u2 = crypto.randomUUID()
    const a3 = crypto.randomUUID()
    await call(`/conversations/${conversationId}/messages`, {
      token: alice,
      body: { message: { id: u2, parentId: a2, text: 'follow up', fileIds: [] }, assistantId: a3, model: { providerId, modelId: 'm1' } },
    })
    expect((await call(`/conversations/${conversationId}/messages/${u2}`, { method: 'DELETE', token: alice })).status).toBe(204)
    const messages = (await call(`/conversations/${conversationId}`, { token: alice })).data.messages
    expect(messages.filter((m: any) => m.parentId === u1)).toHaveLength(2)
    expect(messages.find((m: any) => m.id === a3).parentId).toBe(a2)
  })

  it('rejects branching from a message in another conversation', async () => {
    const other = (await call('/conversations', { token: alice, body: {} })).data.id
    const res = await call(`/conversations/${other}/messages`, {
      token: alice,
      body: { message: { id: crypto.randomUUID(), parentId: u1, text: 'x', fileIds: [] }, assistantId: crypto.randomUUID(), model: { providerId, modelId: 'm1' } },
    })
    expect(res.status).toBe(404)
  })

  it('keeps conversations private to their owner', async () => {
    expect((await call(`/conversations/${conversationId}`, { token: bob })).status).toBe(404)
    expect((await call(`/conversations/${conversationId}`, { method: 'DELETE', token: bob })).status).toBe(404)
    expect((await call(`/conversations/${conversationId}`, { token: admin })).status).toBe(200)
    const bobSearch = await call(`/search?q=${encodeURIComponent('世界')}`, { token: bob })
    expect(bobSearch.data).toEqual([])
  })

  it('finds messages with Chinese full-text search', async () => {
    const res = await call(`/search?q=${encodeURIComponent('世界')}`, { token: alice })
    expect(res.data[0]).toMatchObject({ conversationId, messageId: u1 })
    expect(res.data[0].highlight).toContain('<em>世界</em>')
  })

  it('shares a branch snapshot publicly until it expires', async () => {
    const share = (await call('/shares', { token: alice, body: { conversationId, leafMessageId: a1, expiresAt: null } })).data
    const pub = await call(`/public/shares/${share.id}`)
    expect(pub.data.messages.map((m: any) => m.id)).toEqual([u1, a1])
    await call(`/shares/${share.id}`, { method: 'PATCH', token: alice, body: { expiresAt: '2020-01-01T00:00:00.000Z' } })
    expect((await call(`/public/shares/${share.id}`)).status).toBe(404)
    expect((await call(`/shares/${share.id}`, { method: 'DELETE', token: bob })).status).toBe(404)
  })

  it('revokes tokens after a password change', async () => {
    const res = await call('/me/password', { method: 'PUT', token: alice, body: { oldPassword: 'password123', newPassword: 'newpassword456' } })
    expect(res.status).toBe(200)
    expect((await call('/me', { token: alice })).status).toBe(401)
    expect((await call('/me', { token: res.data.tokens.accessToken })).status).toBe(200)
  })
})
