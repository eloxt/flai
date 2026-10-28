import { SECRET_SETTING_FIELDS, SETTING_KEYS, type SettingKey, settingSchemas, type SettingValue } from '@flai/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import { badRequest, notFound } from '../lib/errors'
import { type AppEnv, body } from '../lib/hono'
import { embedWith } from '../llm/embedding'
import { nudgeEmbeddingIndexer } from '../llm/embedding-index'
import { verifyTypeSafe } from '../llm/topic-check'
import { findProvider, maskKey, resolveModel } from '../services/providers'
import { getSetting, updateSetting } from '../services/settings'

type Check<K extends SettingKey> = (next: SettingValue<K>, current: SettingValue<K>) => void | Promise<void>

/** Reject a setting that would only fail later, when something uses it. */
const checks: { [K in SettingKey]?: Check<K> } = {
  web_search: (next) => {
    if (next.provider === 'exa' && !next.exaApiKey) throw badRequest('Exa API key is required when Exa search is selected')
  },
  topic_check: async (next, current) => {
    if (!next.enabled) return
    if (!next.apiKey) throw badRequest('TypeSafe API key is required to turn on topic checks')
    const changed = next.apiKey !== current.apiKey || next.baseUrl !== current.baseUrl || next.model !== current.model
    if (changed || !current.enabled) await verifyTypeSafe(next, next.model)
  },
  title_generation: (next) => {
    if (next.providerId || next.modelId) resolveModel(next.providerId, next.modelId)
  },
  background_model: (next) => {
    if (next.providerId || next.modelId) resolveModel(next.providerId, next.modelId)
  },
  embedding: async (next) => {
    if (!next.providerId && !next.modelId) return
    const provider = findProvider(next.providerId)
    if (!provider) throw notFound('Provider')
    if (!next.modelId) throw badRequest('Model is required')
    // Fail now rather than in the background indexer.
    await embedWith(provider, next.modelId, ['test'], AbortSignal.timeout(30_000)).catch((error: unknown) => {
      throw badRequest(error instanceof Error ? error.message : String(error))
    })
  },
}

const afterSave: { [K in SettingKey]?: () => void } = {
  embedding: nudgeEmbeddingIndexer,
}

const isSettingKey = (key: string): key is SettingKey => (SETTING_KEYS as string[]).includes(key)

function settingKey(raw: string): SettingKey {
  if (!isSettingKey(raw)) throw notFound('Setting')
  return raw
}

const secretsOf = <K extends SettingKey>(key: K) => (SECRET_SETTING_FIELDS[key] ?? []) as readonly (keyof SettingValue<K> & string)[]

function masked<K extends SettingKey>(key: K, value: SettingValue<K>): SettingValue<K> {
  const out = { ...value } as Record<string, unknown>
  for (const field of secretsOf(key)) out[field] = out[field] ? maskKey(String(out[field])) : ''
  return out as SettingValue<K>
}

/** Every field optional and without its default, so a partial update never resets what it leaves out. */
function patchSchema(key: SettingKey) {
  const shape = settingSchemas[key].shape as Record<string, z.ZodType>
  return z.object(Object.fromEntries(Object.entries(shape).map(([name, field]) => [
    name,
    (field instanceof z.ZodDefault ? (field.removeDefault() as z.ZodType) : field).optional(),
  ])))
}

async function saveSetting<K extends SettingKey>(key: K, raw: unknown): Promise<SettingValue<K>> {
  const current = getSetting(key)
  const patch = raw as Partial<Record<string, unknown>>
  // The masked value echoed back by the form means "keep the stored secret".
  for (const field of secretsOf(key)) {
    const stored = current[field]
    if (typeof stored === 'string' && stored && patch[field] === maskKey(stored)) delete patch[field]
  }
  await (checks[key] as Check<K> | undefined)?.({ ...current, ...patch } as SettingValue<K>, current)
  const value = await updateSetting(key, patch as Partial<SettingValue<K>>)
  afterSave[key]?.()
  return value
}

export const settingRoutes = new Hono<AppEnv>()
  .get('/:key', (c) => {
    const key = settingKey(c.req.param('key'))
    return c.json(masked(key, getSetting(key)))
  })
  .put('/:key', async (c) => {
    const key = settingKey(c.req.param('key'))
    const value = await saveSetting(key, await body(c, patchSchema(key)))
    return c.json(masked(key, value))
  })
