import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { embedMany, type EmbeddingModel } from 'ai'
import { EMBEDDING_DIMENSIONS } from '../db/schema'
import { AppError } from '../lib/errors'
import { findProvider, type ProviderRow } from '../services/providers'
import { getSetting } from '../services/settings'
import { geminiBaseUrl } from './models'

export interface Embedder {
  /** `providerId:modelId[@baseUrl]`, stored with each vector so a model change re-embeds everything. */
  key: string
  embed: (values: string[], abortSignal?: AbortSignal) => Promise<number[][]>
}

export interface EmbeddingTarget {
  provider: ProviderRow
  modelId: string
  /** Replaces the provider's base URL when set. */
  baseUrl?: string
}

function embeddingModel({ provider, modelId, baseUrl }: EmbeddingTarget): EmbeddingModel {
  const base = baseUrl || provider.baseUrl
  const baseURL = base || undefined
  switch (provider.type) {
    case 'openai':
      return createOpenAI({ apiKey: provider.apiKey, baseURL }).embedding(modelId)
    case 'openai_completion':
      return createOpenAICompatible({ name: 'openaiCompatible', apiKey: provider.apiKey, baseURL: baseURL ?? 'https://api.openai.com/v1' })
        .embeddingModel(modelId)
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey: provider.apiKey, baseURL: geminiBaseUrl(base) }).embedding(modelId)
    default:
      throw new AppError('NOT_CONFIGURED', `Unsupported provider type ${String(provider.type)}`)
  }
}

/** Embed `values` with a provider's model, requesting the dimensions the vector column stores. */
export async function embedWith(target: EmbeddingTarget, values: string[], abortSignal?: AbortSignal): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: embeddingModel(target),
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
  const { providerId, modelId, baseUrl } = getSetting('embedding')
  const provider = providerId && modelId ? findProvider(providerId) : undefined
  if (!provider) return null
  return {
    // A different endpoint may serve a different model under the same name.
    key: `${providerId}:${modelId}${baseUrl ? `@${baseUrl}` : ''}`,
    embed: (values, abortSignal) => embedWith({ provider, modelId, baseUrl }, values, abortSignal),
  }
}
