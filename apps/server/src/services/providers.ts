import type { ModelConfig, PublicProvider } from '@flai/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db'
import { AppError } from '../lib/errors'

export type ProviderRow = typeof schema.providers.$inferSelect

let active: ProviderRow[] = []

/** Rebuild the in-memory list of active providers. Called at startup and after every admin write. */
export async function reloadProviders(): Promise<void> {
  active = await db
    .select()
    .from(schema.providers)
    .where(and(eq(schema.providers.isActive, true), isNull(schema.providers.deletedAt)))
    .orderBy(schema.providers.sortOrder, schema.providers.createdAt, schema.providers.id)
}

export function listPublicProviders(): PublicProvider[] {
  return active.map((p) => ({ id: p.id, name: p.name, type: p.type, logo: p.logo, models: p.models }))
}

export function findProvider(providerId: string): ProviderRow | undefined {
  return active.find((p) => p.id === providerId)
}

/** Resolve an active provider + model pair or fail with a user-facing error. */
export function resolveModel(providerId: string, modelId: string): { provider: ProviderRow; model: ModelConfig } {
  const provider = findProvider(providerId)
  if (!provider) throw new AppError('NOT_FOUND', 'Provider not found or inactive')
  const model = provider.models.find((m) => m.id === modelId)
  if (!model) throw new AppError('NOT_FOUND', `Model ${modelId} is not available`)
  return { provider, model }
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}****${key.slice(-4)}`
}
