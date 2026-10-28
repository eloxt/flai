import { type SettingKey, settingSchemas } from '@flai/shared'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../src/lib/errors'
import type { AppEnv } from '../src/lib/hono'

const state = vi.hoisted(() => ({ values: new Map<string, unknown>(), patches: [] as unknown[] }))
vi.mock('../src/services/settings', () => ({
  getSetting: (key: SettingKey) => state.values.get(key) ?? settingSchemas[key].parse({}),
  updateSetting: async (key: SettingKey, patch: object) => {
    state.patches.push(patch)
    const next = settingSchemas[key].parse({ ...(state.values.get(key) ?? {}), ...patch })
    state.values.set(key, next)
    return next
  },
}))
vi.mock('../src/llm/topic-check', () => ({ verifyTypeSafe: vi.fn() }))

import { settingRoutes } from '../src/routes/admin-settings'
import { maskKey } from '../src/services/providers'

const app = new Hono<AppEnv>()
  .route('/', settingRoutes)
  .onError((error, c) => c.json({ error: error.message }, error instanceof AppError ? error.status : 500))
const put = (key: string, body: unknown) => app.request(`/${key}`, {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  state.values.clear()
  state.patches = []
})

describe('admin settings', () => {
  it('reports unknown settings as not found', async () => {
    expect((await app.request('/nope')).status).toBe(404)
    expect((await put('nope', {})).status).toBe(404)
  })

  it('masks the TypeSafe key and keeps it when the masked value comes back', async () => {
    const saved = await put('topic_check', { apiKey: 'typesafe-private-key' })
    expect((await saved.json()).apiKey).toBe(maskKey('typesafe-private-key'))
    expect(await (await app.request('/topic_check')).text()).not.toContain('typesafe-private-key')
    await put('topic_check', { apiKey: maskKey('typesafe-private-key'), threshold: 0.9 })
    expect(state.values.get('topic_check')).toMatchObject({ apiKey: 'typesafe-private-key', threshold: 0.9 })
    expect((await put('topic_check', { enabled: true, apiKey: '' })).status).toBe(400)
  })

  it('updates only the fields sent, without filling in defaults', async () => {
    state.values.set('system_prompt', { chat: 'Be brief.', translate: 'Translate faithfully.' })
    await put('system_prompt', { chat: 'Be thorough.' })
    expect(state.patches).toEqual([{ chat: 'Be thorough.' }])
    expect(state.values.get('system_prompt')).toEqual({ chat: 'Be thorough.', translate: 'Translate faithfully.' })
  })

  it('rejects a title model that is not available', async () => {
    expect((await put('title_generation', { providerId: 'missing', modelId: 'x' })).status).toBe(404)
    expect((await put('title_generation', { providerId: '', modelId: '' })).status).toBe(200)
  })
})
