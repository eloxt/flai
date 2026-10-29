import { type SettingKey, type SettingValue, settingSchemas, SETTING_KEYS } from '@flai/shared'
import { db, schema } from '../db'
import { cacheSync } from '../lib/cache-sync'

const cache = new Map<SettingKey, unknown>()

function normalize<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  const parsed = settingSchemas[key].safeParse(value ?? {})
  // A malformed stored value falls back to defaults rather than breaking every request.
  return (parsed.success ? parsed.data : settingSchemas[key].parse({})) as SettingValue<K>
}

export async function loadSettings(): Promise<void> {
  const rows = await db.select().from(schema.settings)
  cache.clear()
  for (const key of SETTING_KEYS) {
    cache.set(key, normalize(key, rows.find((r) => r.key === key)?.value))
  }
}

export function getSetting<K extends SettingKey>(key: K): SettingValue<K> {
  return (cache.get(key) as SettingValue<K> | undefined) ?? normalize(key, undefined)
}

/** Merge `patch` into the stored value, persist it and refresh the cache here and on other instances. */
export async function updateSetting<K extends SettingKey>(key: K, patch: Partial<SettingValue<K>>): Promise<SettingValue<K>> {
  const next = settingSchemas[key].parse({ ...getSetting(key), ...patch }) as SettingValue<K>
  await db
    .insert(schema.settings)
    .values({ key, value: next })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: next } })
  cache.set(key, next)
  await cacheSync().changed('settings')
  return next
}
