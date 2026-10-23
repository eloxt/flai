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
  /** Built-in tools, including native tools and Exa search/page retrieval. */
  tools: ToolsInput
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

export function buildModel({ provider, model, options = {}, requestId }: BuildOptions): ResolvedModel {
  const headers = requestId ? { 'x-request-id': requestId } : undefined
  const baseURL = provider.baseUrl || undefined
  const thinking = resolveThinking(model, options.thinking)
  const wants = (t: 'web_search' | 'url_context') => model.internalTools.includes(t)
  // Mastra 1.77 does not resolve webSearchTool placeholders passed via toolsets.
  const tools: ToolsInput = {}
  const search = getSetting('web_search')
  const nativeSearch = options.webSearch && wants('web_search') && search.provider === 'native'
  if (search.provider === 'exa' && model.toolCall) {
    if (!search.exaApiKey) throw new AppError('NOT_CONFIGURED', 'Exa API key is not configured')
    tools.web_search = createWebSearchTool(search.exaApiKey)
    tools.web_fetch = createWebFetchTool(search.exaApiKey)
  }
  // Wikimedia needs no key, so photos are available to every model that can call tools.
  if (model.toolCall) tools.image_search = imageSearchTool

  switch (provider.type) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: provider.apiKey, baseURL, headers })
      if (nativeSearch) tools.web_search = openai.tools.webSearch()
      return {
        model: openai.responses(model.id),
        providerOptions: {
          openai: {
            ...(thinking && model.reasoning ? { reasoningEffort: thinking, reasoningSummary: 'auto' } : {}),
            store: false,
          },
        },
        tools,
      }
    }
    case 'openai_completion': {
      const compatible = createOpenAICompatible({
        name: 'openaiCompatible',
        apiKey: provider.apiKey,
        baseURL: baseURL ?? 'https://api.openai.com/v1',
        headers,
        includeUsage: true,
      })
      // OpenRouter exposes web search as a model variant rather than a tool.
      const id = nativeSearch && isOpenRouter(provider) ? `${model.id}:online` : model.id
      return {
        model: compatible.chatModel(id),
        providerOptions: { openaiCompatible: thinking && model.reasoning ? { reasoningEffort: thinking } : {} },
        tools,
      }
    }
    case 'gemini': {
      const google = createGoogleGenerativeAI({ apiKey: provider.apiKey, baseURL: geminiBaseUrl(provider.baseUrl), headers })
      if (nativeSearch) tools.google_search = google.tools.googleSearch({})
      if (search.provider === 'native' && options.urlContext && wants('url_context')) tools.url_context = google.tools.urlContext({})
      return {
        model: google(model.id),
        providerOptions: {
          google: {
            thinkingConfig: {
              includeThoughts: model.reasoning,
              ...(thinking ? { thinkingLevel: geminiThinkingLevel(thinking) } : {}),
            },
          },
        },
        tools,
      }
    }
    default:
      throw new AppError('NOT_CONFIGURED', `Unsupported provider type ${String(provider.type)}`)
  }
}
