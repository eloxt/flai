import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { ChatOptions, ModelConfig, ThinkingLevel } from '@flai/shared'
import type { ToolsInput } from '@mastra/core/agent'
import type { LanguageModel } from 'ai'
import { AppError } from '../lib/errors'
import type { ProviderRow } from '../services/providers'
import { getSetting } from '../services/settings'
import { imageSearchTool } from './image-search'
import { createWebSearchTool } from './web-search'
import { createWebFetchTool } from './web-fetch'

export interface ResolvedModel {
  model: Exclude<LanguageModel, string>
  providerOptions: Record<string, Record<string, unknown>>
}

interface BuildOptions {
  provider: ProviderRow
  model: ModelConfig
  options?: Partial<Pick<ChatOptions, 'thinking' | 'webSearch' | 'urlContext'>>
  requestId?: string
}

const isOpenRouter = (provider: ProviderRow) =>
  /(^|\.)openrouter\.ai$/i.test(URL.parse(provider.baseUrl ?? '')?.hostname ?? '') || /openrouter/i.test(provider.name)

/**
 * `@ai-sdk/google` appends `/models/...` straight onto its base URL, so a bare gateway root such as
 * `https://gateway/genai` hits a path the upstream does not serve (405). Add the API version when the
 * configured URL does not already end in one.
 */
export function geminiBaseUrl(baseUrl: string | null | undefined): string | undefined {
  const url = baseUrl?.trim().replace(/\/+$/, '')
  if (!url) return undefined
  return /\/v\d+(alpha|beta)?$/.test(url) ? url : `${url}/v1beta`
}

/** Validate the requested thinking level against the model, defaulting to its first level. */
export function resolveThinking(model: ModelConfig, requested: ThinkingLevel | undefined): ThinkingLevel | undefined {
  if (!requested) return model.thinkingLevels[0]
  if (!model.thinkingLevels.includes(requested)) {
    throw new AppError('VALIDATION', `Thinking level "${requested}" is not supported by ${model.id}`)
  }
  return requested
}

function geminiThinkingLevel(level: ThinkingLevel): 'minimal' | 'low' | 'medium' | 'high' {
  if (level === 'none') return 'minimal'
  if (level === 'xhigh' || level === 'max') return 'high'
  return level
}

/** The AI SDK client for a provider, tagged with its type; chat and embedding models both come from it. */
export function providerClient(provider: ProviderRow, headers?: Record<string, string>) {
  const baseURL = provider.baseUrl || undefined
  switch (provider.type) {
    case 'openai':
      return { type: 'openai', sdk: createOpenAI({ apiKey: provider.apiKey, baseURL, headers }) } as const
    case 'openai_completion':
      return {
        type: 'openai_completion',
        sdk: createOpenAICompatible({
          name: 'openaiCompatible',
          apiKey: provider.apiKey,
          baseURL: baseURL ?? 'https://api.openai.com/v1',
          headers,
          includeUsage: true,
        }),
      } as const
    case 'gemini':
      return { type: 'gemini', sdk: createGoogleGenerativeAI({ apiKey: provider.apiKey, baseURL: geminiBaseUrl(provider.baseUrl), headers }) } as const
    default:
      throw new AppError('NOT_CONFIGURED', `Unsupported provider type ${String(provider.type)}`)
  }
}

/** Whether the provider's own search should run for this request, rather than Exa or none. */
function wantsNativeSearch(model: ModelConfig, options: BuildOptions['options'] = {}) {
  return Boolean(options.webSearch) && model.internalTools.includes('web_search') && getSetting('web_search').provider === 'native'
}

export function buildModel({ provider, model, options = {}, requestId }: BuildOptions): ResolvedModel {
  const client = providerClient(provider, requestId ? { 'x-request-id': requestId } : undefined)
  const thinking = resolveThinking(model, options.thinking)
  switch (client.type) {
    case 'openai':
      return {
        model: client.sdk.responses(model.id),
        providerOptions: {
          openai: {
            ...(thinking && model.reasoning ? { reasoningEffort: thinking, reasoningSummary: 'auto' } : {}),
            store: false,
          },
        },
      }
    case 'openai_completion': {
      // OpenRouter exposes web search as a model variant rather than a tool.
      const id = wantsNativeSearch(model, options) && isOpenRouter(provider) ? `${model.id}:online` : model.id
      return {
        model: client.sdk.chatModel(id),
        providerOptions: { openaiCompatible: thinking && model.reasoning ? { reasoningEffort: thinking } : {} },
      }
    }
    case 'gemini':
      return {
        model: client.sdk(model.id),
        providerOptions: {
          google: {
            thinkingConfig: {
              includeThoughts: model.reasoning,
              ...(thinking ? { thinkingLevel: geminiThinkingLevel(thinking) } : {}),
            },
          },
        },
      }
  }
}

/** The built-in tools for a chat reply: the provider's native search, or Exa search and page retrieval, and image search. */
export function chatTools({ provider, model, options = {} }: Omit<BuildOptions, 'requestId'>): ToolsInput {
  // Mastra 1.77 does not resolve webSearchTool placeholders passed via toolsets.
  const tools: ToolsInput = {}
  const search = getSetting('web_search')
  if (search.provider === 'exa' && model.toolCall) {
    if (!search.exaApiKey) throw new AppError('NOT_CONFIGURED', 'Exa API key is not configured')
    tools.web_search = createWebSearchTool(search.exaApiKey)
    tools.web_fetch = createWebFetchTool(search.exaApiKey)
  }
  // Wikimedia needs no key, so photos are available to every model that can call tools.
  if (model.toolCall) tools.image_search = imageSearchTool

  const nativeSearch = wantsNativeSearch(model, options)
  const client = providerClient(provider)
  if (client.type === 'openai' && nativeSearch) tools.web_search = client.sdk.tools.webSearch()
  if (client.type === 'gemini') {
    if (nativeSearch) tools.google_search = client.sdk.tools.googleSearch({})
    if (search.provider === 'native' && options.urlContext && model.internalTools.includes('url_context')) {
      tools.url_context = client.sdk.tools.urlContext({})
    }
  }
  return tools
}
