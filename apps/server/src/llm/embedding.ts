import { embedMany, type EmbeddingModel } from 'ai'
import { EMBEDDING_DIMENSIONS } from '../db/schema'
import { AppError } from '../lib/errors'
import { findProvider, type ProviderRow } from '../services/providers'
import { getSetting } from '../services/settings'
import { providerClient } from './models'

export interface Embedder {
  /** `providerId:modelId`, stored with each vector so a model change re-embeds everything. */
  key: string
  embed: (values: string[], abortSignal?: AbortSignal) => Promise<number[][]>
}

function embeddingModel(provider: ProviderRow, modelId: string): EmbeddingModel {
  const client = providerClient(provider)
  switch (client.type) {
    case 'openai':
      return client.sdk.embedding(modelId)
    case 'openai_completion':
      return client.sdk.embeddingModel(modelId)
    case 'gemini':
      return client.sdk.embedding(modelId)
  }
}

/** Embed `values` with a provider's model, requesting the dimensions the vector column stores. */
export async function embedWith(provider: ProviderRow, modelId: string, values: string[], abortSignal?: AbortSignal): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: embeddingModel(provider, modelId),
    values,
    dimensions: EMBEDDING_DIMENSIONS,
    maxRetries: 1,
    abortSignal,
  })
  const wrong = embeddings.find((e) => e.length !== EMBEDDING_DIMENSIONS)
  if (wrong) {
    throw new AppError('VALIDATION', `The embedding model returned ${wrong.length} dimensions instead of ${EMBEDDING_DIMENSIONS}`)
  }
  return embeddings
}

/** The configured embedding model, or null when semantic search is off or its provider is inactive. */
export function getEmbedder(): Embedder | null {
  const { providerId, modelId } = getSetting('embedding')
  const provider = providerId && modelId ? findProvider(providerId) : undefined
  if (!provider) return null
  return {
    key: `${providerId}:${modelId}`,
    embed: (values, abortSignal) => embedWith(provider, modelId, values, abortSignal),
  }
}
