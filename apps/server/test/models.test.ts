import { modelConfigSchema, settingSchemas } from '@flai/shared'
import { Agent } from '@mastra/core/agent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildModel, chatTools, geminiBaseUrl } from '../src/llm/models'
import type { ProviderRow } from '../src/services/providers'

const build = (input: Parameters<typeof buildModel>[0]) => ({ ...buildModel(input), tools: chatTools(input) })

const settings = vi.hoisted(() => ({ provider: 'native' as 'native' | 'exa', exaApiKey: '' }))
vi.mock('../src/services/settings', () => ({ getSetting: () => settings }))
beforeEach(() => Object.assign(settings, settingSchemas.web_search.parse({})))

const provider: ProviderRow = {
  id: 'test', name: 'Test', type: 'openai', apiKey: 'test-key', baseUrl: 'https://llm.example.com/v1',
  logo: null, models: [], isActive: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
}

afterEach(() => vi.unstubAllGlobals())

describe('provider-native tools', () => {
  it.each(['openai', 'gemini'] as const)('passes %s search tools through Mastra to the provider', async (type) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(type === 'openai' ? {
      id: 'resp_test', object: 'response', created_at: 1, status: 'completed', model: 'test',
      output: [{
        id: 'msg_test', type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'Search result', annotations: [] }],
      }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    } : {
      candidates: [{ content: { role: 'model', parts: [{ text: 'Search result' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    }))
    vi.stubGlobal('fetch', fetch)

    const resolved = build({
      provider: { ...provider, type },
      model: modelConfigSchema.parse({
        id: type === 'openai' ? 'gpt-4.1' : 'gemini-2.5-flash', internalTools: ['web_search', 'url_context'],
      }),
      options: { webSearch: true, urlContext: true },
      requestId: 'test-request',
    })
    if (resolved.model.specificationVersion !== 'v4') throw new Error('Expected an AI SDK v7 model')
    const agent = new Agent({ id: 'test', name: 'Test', instructions: 'Use search.', model: resolved.model })
    const result = await agent.generate('Search the web.', {
      toolsets: { builtin: resolved.tools },
      maxSteps: 1,
    })

    expect(result.text).toBe('Search result')
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]!
    expect(new Headers(init?.headers).get('x-request-id')).toBe('test-request')
    const body = JSON.parse(init?.body as string)
    if (type === 'openai') {
      expect(url).toBe('https://llm.example.com/v1/responses')
      expect(body.tools).toEqual([expect.objectContaining({ type: 'web_search' })])
    } else {
      expect(url).toBe('https://llm.example.com/v1/models/gemini-2.5-flash:generateContent')
      expect(body.tools).toEqual(expect.arrayContaining([
        expect.objectContaining({ googleSearch: {} }), expect.objectContaining({ urlContext: {} }),
      ]))
    }
  })

  it.each([
    { webSearch: false, internalTools: ['web_search'] },
    { webSearch: true, internalTools: [] },
  ])('requires both search opt-in and model support: %j', ({ webSearch, internalTools }) => {
    for (const type of ['openai', 'gemini'] as const) {
      const resolved = build({
        provider: { ...provider, type },
        model: modelConfigSchema.parse({ id: 'test', internalTools }),
        options: { webSearch },
      })
      expect(resolved.tools).toEqual({})
    }
  })

  it('keeps OpenRouter search as an online model variant', () => {
    const resolved = build({
      provider: { ...provider, name: 'OpenRouter', type: 'openai_completion' },
      model: modelConfigSchema.parse({ id: 'openai/gpt-4.1', internalTools: ['web_search'] }),
      options: { webSearch: true },
    })
    expect(resolved.model.modelId).toBe('openai/gpt-4.1:online')
    expect(resolved.tools).toEqual({})
  })

  it('recognises OpenRouter by its base URL whatever the provider is called', () => {
    const resolved = build({
      provider: { ...provider, name: 'Router', type: 'openai_completion', baseUrl: 'https://openrouter.ai/api/v1' },
      model: modelConfigSchema.parse({ id: 'openai/gpt-4.1', internalTools: ['web_search'] }),
      options: { webSearch: true },
    })
    expect(resolved.model.modelId).toBe('openai/gpt-4.1:online')
  })
})

describe('geminiBaseUrl', () => {
  it('leaves the SDK default alone when unset', () => {
    expect(geminiBaseUrl(null)).toBeUndefined()
    expect(geminiBaseUrl('')).toBeUndefined()
  })

  it('adds the API version to a bare gateway root', () => {
    expect(geminiBaseUrl('http://gateway.internal:3100/genai')).toBe('http://gateway.internal:3100/genai/v1beta')
    expect(geminiBaseUrl('https://gateway.example.com/')).toBe('https://gateway.example.com/v1beta')
  })

  it('keeps a URL that already carries a version', () => {
    expect(geminiBaseUrl('https://generativelanguage.googleapis.com/v1beta')).toBe('https://generativelanguage.googleapis.com/v1beta')
    expect(geminiBaseUrl('http://gw/genai/v1beta/')).toBe('http://gw/genai/v1beta')
    expect(geminiBaseUrl('http://gw/genai/v1')).toBe('http://gw/genai/v1')
  })
})

describe('global Exa search', () => {
  it.each(['openai', 'openai_completion', 'gemini'] as const)('uses an executable Exa tool with %s and preserves the model id', (type) => {
    Object.assign(settings, { provider: 'exa', exaApiKey: 'exa-test-key' })
    const resolved = build({
      provider: { ...provider, type, name: 'OpenRouter' },
      model: modelConfigSchema.parse({ id: 'test-model', toolCall: true }),
      options: { webSearch: false, urlContext: false },
    })
    expect(resolved.model.modelId).toBe('test-model')
    expect(Object.keys(resolved.tools)).toEqual(['web_search', 'web_fetch', 'image_search'])
    expect(resolved.tools.web_search).toMatchObject({ id: 'web_search', execute: expect.any(Function) })
    expect(resolved.tools.web_fetch).toMatchObject({ id: 'web_fetch', execute: expect.any(Function) })
  })

  it.each([undefined, { webSearch: false, urlContext: false }, { webSearch: true, urlContext: true }])('always supplies both tools and disables native URL context regardless of saved options: %j', (options) => {
    Object.assign(settings, { provider: 'exa', exaApiKey: 'exa-test-key' })
    const model = modelConfigSchema.parse({ id: 'test', toolCall: true, internalTools: ['web_search', 'url_context'] })
    for (const type of ['openai', 'openai_completion', 'gemini'] as const) {
      expect(Object.keys(build({ provider: { ...provider, type }, model, options }).tools)).toEqual(['web_search', 'web_fetch', 'image_search'])
    }
  })

  it('offers image_search to every model that can call tools, without an Exa key', () => {
    Object.assign(settings, { provider: 'native', exaApiKey: '' })
    const model = modelConfigSchema.parse({ id: 'test', toolCall: true })
    for (const type of ['openai', 'openai_completion', 'gemini'] as const) {
      const tools = build({ provider: { ...provider, type }, model, options: {} }).tools
      expect(Object.keys(tools)).toEqual(['image_search'])
      expect(tools.image_search).toMatchObject({ id: 'image_search', execute: expect.any(Function) })
      expect(build({ provider: { ...provider, type }, model: { ...model, toolCall: false }, options: {} }).tools).toEqual({})
    }
  })

  it('builds models for single calls without the chat tools or their key', () => {
    Object.assign(settings, { provider: 'exa', exaApiKey: '' })
    const model = modelConfigSchema.parse({ id: 'test', toolCall: true })
    expect(buildModel({ provider, model })).not.toHaveProperty('tools')
  })

  it('fails clearly instead of falling back to native search', () => {
    settings.provider = 'exa'
    const model = modelConfigSchema.parse({ id: 'test', toolCall: true, internalTools: ['web_search'] })
    expect(() => build({ provider, model, options: { webSearch: true } })).toThrow('Exa API key is not configured')
    settings.exaApiKey = 'exa-test-key'
    for (const type of ['openai', 'openai_completion', 'gemini'] as const) {
      expect(build({ provider: { ...provider, type }, model: { ...model, toolCall: false, internalTools: ['web_search', 'url_context'] }, options: { webSearch: true, urlContext: true } }).tools).toEqual({})
    }
  })
})
