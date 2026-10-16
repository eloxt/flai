import { modelConfigSchema, settingSchemas, type SettingKey } from '@flai/shared'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../src/lib/errors'
import type { AppEnv } from '../src/lib/hono'

const state = vi.hoisted(() => ({ search: { provider: 'native' as 'native' | 'exa', exaApiKey: '' }, rows: [] as unknown[] }))
vi.mock('../src/services/settings', () => ({
  getSetting: (key: SettingKey) => key === 'web_search' ? state.search : settingSchemas[key].parse({}),
  updateSetting: async (_key: SettingKey, patch: object) => (state.search = { ...state.search, ...patch }),
}))
vi.mock('../src/db', async () => ({
  schema: await import('../src/db/schema'),
  db: { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => state.rows }) }) }) },
}))

import { adminRoutes } from '../src/routes/admin'
import { listPublicProviders, maskKey, reloadProviders } from '../src/services/providers'
import { requireAdmin } from '../src/middleware/auth'

const app = new Hono<AppEnv>()
  .use('*', async (c, next) => {
    c.set('user', { role: c.req.header('x-role') ?? 'admin' } as AppEnv['Variables']['user'])
    await next()
  })
  .use('*', requireAdmin)
  .route('/', adminRoutes)
  .onError((error, c) => c.json({ error: error.message }, error instanceof AppError ? error.status : 500))
const put = (body: unknown) => app.request('/settings/web_search', {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
beforeEach(() => { state.search = settingSchemas.web_search.parse({}) })

describe('admin web search settings', () => {
  it('defaults to native search and protects access', async () => {
    expect(await (await app.request('/settings/web_search')).json()).toEqual({ provider: 'native', exaApiKey: '' })
    expect((await app.request('/settings/web_search', { headers: { 'x-role': 'user' } })).status).toBe(403)
    expect((await app.request('/settings/web_search', { method: 'PUT', headers: { 'x-role': 'user' } })).status).toBe(403)
  })

  it('requires a key and masks it on reads and writes', async () => {
    expect((await put({ provider: 'exa' })).status).toBe(400)
    const saved = await put({ provider: 'exa', exaApiKey: '  exa-private-test-key  ' })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ provider: 'exa', exaApiKey: maskKey('exa-private-test-key') })
    expect(state.search.exaApiKey).toBe('exa-private-test-key')
    expect(await (await app.request('/settings/web_search')).text()).not.toContain('exa-private-test-key')
  })

  it('preserves a masked key across switches, supports rotation and explicit removal', async () => {
    state.search = { provider: 'exa', exaApiKey: 'exa-original-key' }
    await put({ provider: 'native', exaApiKey: maskKey(state.search.exaApiKey) })
    expect(state.search).toEqual({ provider: 'native', exaApiKey: 'exa-original-key' })
    await put({ provider: 'exa' })
    expect(state.search.provider).toBe('exa')
    expect((await put({ exaApiKey: '' })).status).toBe(400)
    await put({ exaApiKey: 'replacement-key' })
    expect(state.search.exaApiKey).toBe('replacement-key')
    await put({ provider: 'native', exaApiKey: '' })
    expect(state.search.exaApiKey).toBe('')
  })

  it('rejects unknown providers', async () => {
    expect((await put({ provider: 'unknown' })).status).toBe(422)
  })

  it('hides native search and URL context toggles in Exa mode without rewriting stored capabilities or exposing keys', async () => {
    const models = [
      modelConfigSchema.parse({ id: 'compatible', toolCall: true }),
      modelConfigSchema.parse({ id: 'native-only', internalTools: ['web_search', 'url_context'] }),
    ]
    state.rows = [{ id: 'p1', name: 'Test', type: 'openai_completion', logo: null, models, apiKey: 'llm-private-key' }]
    await reloadProviders()
    state.search = { provider: 'exa', exaApiKey: 'exa-private-key' }
    const publicProviders = listPublicProviders()
    expect(publicProviders[0]!.models.map((m) => m.internalTools)).toEqual([[], []])
    expect(JSON.stringify(publicProviders)).not.toContain('private-key')
    state.search.provider = 'native'
    expect(listPublicProviders()[0]!.models).toEqual(models)
    expect(models[0]!.internalTools).toEqual([])
  })
})
