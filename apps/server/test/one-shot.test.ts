import { modelConfigSchema, settingSchemas } from '@flai/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AppError, userFacingError } from '../src/lib/errors'
import type { ProviderRow } from '../src/services/providers'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), bark: vi.fn(), barkUrl: '' }))
vi.mock('../src/services/settings', () => ({
  getSetting: (key: 'web_search' | 'error_alert') =>
    key === 'error_alert' ? { barkUrl: mocks.barkUrl } : settingSchemas.web_search.parse({}),
}))
vi.mock('../src/services/bark', () => ({ sendBark: mocks.bark }))
vi.mock('../src/llm/agent', () => ({
  getChatAgent: () => ({ generate: mocks.generate }),
  chatContext: (values: object) => values,
}))

import { generateStructured } from '../src/llm/one-shot'

const provider: ProviderRow = {
  id: 'p1', name: 'Test', type: 'openai_completion', apiKey: 'sk-private-test-key', baseUrl: null,
  logo: null, models: [], isActive: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
}
const model = modelConfigSchema.parse({ id: 'small', reasoning: true, thinkingLevels: ['low', 'high'] })
const schema = z.object({ answer: z.string() })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.barkUrl = ''
  mocks.bark.mockResolvedValue(undefined)
})

describe('generateStructured', () => {
  it('asks with the instructions, the model’s default thinking level and the schema', async () => {
    mocks.generate.mockResolvedValue({ object: { answer: 'yes' } })
    const result = await generateStructured('test', { provider, model }, { instructions: 'Be terse.', input: 'Well?', schema })
    expect(result).toEqual({ answer: 'yes' })
    const [input, options] = mocks.generate.mock.calls[0]!
    expect(input).toBe('Well?')
    expect(options.requestContext.instructions).toBe('Be terse.')
    expect(options.providerOptions).toEqual({ openaiCompatible: { reasoningEffort: 'low' } })
    expect(options.structuredOutput).toEqual({ schema })
    expect(options.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('rejects output that does not match the schema', async () => {
    mocks.generate.mockResolvedValue({ object: { answer: 42 } })
    await expect(generateStructured('test', { provider, model }, { instructions: '', input: 'x', schema })).rejects.toThrow()
  })

  it('alerts failures without the API key and rethrows them', async () => {
    mocks.barkUrl = 'https://bark.example.com/key'
    const failure = new Error('401: bad key sk-private-test-key')
    mocks.generate.mockRejectedValue(failure)
    await expect(generateStructured('summary', { provider, model }, { instructions: '', input: 'x', schema })).rejects.toBe(failure)
    const [, title, body] = mocks.bark.mock.calls[0]!
    expect(title).toBe('Flai LLM 请求报错')
    expect(body).toContain('操作：summary')
    expect(body).toContain('模型：small')
    expect(body).toContain('[REDACTED]')
    expect(body).not.toContain('sk-private-test-key')
  })
})

describe('userFacingError', () => {
  it('keeps our own messages and redacts the key from upstream ones', () => {
    expect(userFacingError(new AppError('UPSTREAM', 'Title generation failed'), 'k')).toBe('Title generation failed')
    expect(userFacingError(new Error('denied for sk-1'), 'sk-1')).toBe('denied for [REDACTED]')
    expect(userFacingError(new Error(''))).toBe('Generation failed. Please retry.')
  })
})
