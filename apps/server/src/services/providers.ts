import type { ModelConfig, PublicProvider } from '@flai/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db'
import { cacheSync } from '../lib/cache-sync'
import { AppError } from '../lib/errors'
import { getSetting } from './settings'

export type ProviderRow = typeof schema.providers.$inferSelect

let active: ProviderRow[] = []

/** Rebuild the in-memory list of active providers, at startup and when another instance changes them. */
export async function reloadProviders(): Promise<void> {
  active = await db
    .select()
    .from(schema.providers)
    .where(and(eq(schema.providers.isActive, true), isNull(schema.providers.deletedAt)))
    .orderBy(schema.providers.sortOrder, schema.providers.createdAt, schema.providers.id)
}

/** After an admin write: reload here and on other instances. */
export async function providersChanged(): Promise<void> {
  await reloadProviders()
  await cacheSync().changed('providers')
}

export function listPublicProviders(): PublicProvider[] {
  const exa = getSetting('web_search').provider === 'exa'
  return active
    .map((p) => {
      const models = p.models.filter((model) => !model.hidden)
      return {
        id: p.id, name: p.name, type: p.type, logo: p.logo,
        // Exa tools are automatic; only native mode exposes user-controlled search/URL toggles.
        models: exa ? models.map((model) => ({ ...model, internalTools: [] })) : models,
      }
    })
    .filter((p) => p.models.length > 0)
}

export function findProvider(providerId: string): ProviderRow | undefined {
  return active.find((p) => p.id === providerId)
}

/** Resolve an active provider + model pair or fail with a user-facing error; `user` also rejects hidden models. */
export function resolveModel(providerId: string, modelId: string, { user = false } = {}): { provider: ProviderRow; model: ModelConfig } {
  const provider = findProvider(providerId)
  if (!provider) throw new AppError('NOT_FOUND', 'Provider not found or inactive')
  const model = provider.models.find((m) => m.id === modelId)
  // Hidden models are reserved for background work (titles, summaries).
  if (!model || (user && model.hidden)) throw new AppError('NOT_FOUND', `Model ${modelId} is not available`)
  return { provider, model }
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}****${key.slice(-4)}`
}
