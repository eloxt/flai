import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { ChatOptions, ModelConfig, ThinkingLevel } from '@flai/shared'
import type { LanguageModel, Tool } from 'ai'
import { AppError } from '../lib/errors'
import type { ProviderRow } from '../services/providers'

export interface ResolvedModel {
  model: Exclude<LanguageModel, string>
  providerOptions: Record<string, Record<string, unknown>>
  /** Provider-executed tools (web search, URL context). */
  tools: Record<string, Tool>
}

interface BuildOptions {
  provider: ProviderRow
  model: ModelConfig
  options?: Partial<Pick<ChatOptions, 'thinking' | 'webSearch' | 'urlContext'>>
  requestId?: string
}

const isOpenRouter = (provider: ProviderRow) => provider.name.toLowerCase().includes('openrouter')

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

  switch (provider.type) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: provider.apiKey, baseURL, headers })
      const tools: Record<string, Tool> = {}
      if (options.webSearch && wants('web_search')) tools.web_search = openai.tools.webSearch() as Tool
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
      const id = options.webSearch && wants('web_search') && isOpenRouter(provider) ? `${model.id}:online` : model.id
      return {
        model: compatible.chatModel(id),
        providerOptions: { openaiCompatible: thinking && model.reasoning ? { reasoningEffort: thinking } : {} },
        tools: {},
      }
    }
    case 'gemini': {
      const google = createGoogleGenerativeAI({ apiKey: provider.apiKey, baseURL: geminiBaseUrl(provider.baseUrl), headers })
      const tools: Record<string, Tool> = {}
      if (options.webSearch && wants('web_search')) tools.google_search = google.tools.googleSearch({}) as Tool
      if (options.urlContext && wants('url_context')) tools.url_context = google.tools.urlContext({}) as Tool
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
