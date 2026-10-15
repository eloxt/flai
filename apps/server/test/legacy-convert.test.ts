import { validateUIMessages } from 'ai'
import { describe, expect, it } from 'vitest'
import {
  convertAvatar,
  convertContent,
  convertMessage,
  convertModel,
  convertSystemConfig,
  topoSort,
} from '../src/legacy/convert'

describe('convertContent', () => {
  it('maps text, files, generated images, reasoning and paired tool calls', async () => {
    const parts = convertContent([
      { type: 'reasoning', data: { content: 'thinking' } },
      { type: 'tool_call', data: { id: 't1', name: 'weather', arguments: { city: 'Tokyo' } } },
      { type: 'tool_result', data: { id: 't1', name: 'weather', content: 'Sunny' } },
      {
        type: 'message',
        data: {
          content: 'Answer',
          files: [{ id: 'f1', file_name: 'a.pdf', mime_type: 'application/pdf', size: 3, public_url: 'https://x/a.pdf' }],
          images: [{ id: 'g', public_url: 'https://x/generated/1.jpg' }],
        },
      },
    ])
    expect(parts.map((p) => p.type)).toEqual(['reasoning', 'dynamic-tool', 'text', 'file', 'file'])
    expect(parts[1]).toMatchObject({ toolName: 'weather', state: 'output-available', input: { city: 'Tokyo' }, output: 'Sunny' })
    expect(parts[3]).toMatchObject({ mediaType: 'application/pdf', providerMetadata: { flai: { fileId: 'f1', size: 3 } } })
    expect(parts[4]).toMatchObject({ mediaType: 'image/jpeg', url: 'https://x/generated/1.jpg' })
    await expect(validateUIMessages({ messages: [{ id: 'm', role: 'assistant', parts }] })).resolves.toBeTruthy()
  })

  it('marks tool errors and calls without results as errors', () => {
    const parts = convertContent([
      { type: 'tool_call', data: { id: 'a', name: 'x', arguments: {} } },
      { type: 'tool_result', data: { id: 'a', name: 'x', content: 'boom', is_error: true } },
      { type: 'tool_call', data: { id: 'b', name: 'y', arguments: {} } },
    ])
    expect(parts).toMatchObject([
      { state: 'output-error', errorText: 'boom' },
      { state: 'output-error', errorText: 'No result recorded' },
    ])
  })

  it('ignores pending/unknown items and tolerates garbage', () => {
    expect(convertContent([{ type: 'pending', data: {} }, { type: 'message', data: { content: '' } }])).toEqual([])
    expect(convertContent(null)).toEqual([])
  })
})

describe('convertMessage', () => {
  it('maps root parents, metadata and OpenAI citations', () => {
    const m = convertMessage({
      id: 'm',
      parent_id: '',
      role: 'assistant',
      content: [{ type: 'message', data: { content: 'hi' } }],
      meta_info: {
        model_name: 'gpt',
        prompt_token_count: 3,
        openai_grounding_data: [
          { url: 'https://a', title: 'A' },
          { url: 'https://a', title: 'A again' },
        ],
      },
      created_at: '2025-01-01',
    })
    expect(m.parentId).toBeNull()
    expect(m.metadata).toMatchObject({ modelId: 'gpt', usage: { inputTokens: 3 } })
    expect(m.parts.filter((p) => p.type === 'source-url')).toHaveLength(1)
    expect(m.searchText).toBe('hi')
  })
})

describe('convertModel', () => {
  it('converts snake_case, drops image_generation and invalid entries', () => {
    expect(convertModel({ name: 'no id' })).toBeUndefined()
    expect(
      convertModel({ id: 'x', thinking_levels: ['low', 'low'], internal_tools: ['image_generation', 'url_context'], tool_call: true }),
    ).toMatchObject({ id: 'x', thinkingLevels: ['low'], internalTools: ['url_context'], toolCall: true, generativeUi: false })
  })
})

describe('misc', () => {
  it('decodes avatars stored as text in bytea', () => {
    expect(convertAvatar(Buffer.from('https://x/a.png'))).toBe('https://x/a.png')
    expect(convertAvatar(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull()
    expect(convertAvatar(null)).toBeNull()
  })

  it('splits system_config into settings and notifications', () => {
    const { settings, notifications } = convertSystemConfig([
      { key: 'system_prompt', value: { prompt: 'p', translate: 't' } },
      { key: 'title_generation', value: { provider_id: 'p1', model_name: 'm', prompt: 'x' } },
      { key: 'notification', value: { list: [{ id: 'n', title: 'T', content: 'C', level: 'warning' }] } },
    ])
    expect(settings).toEqual([
      { key: 'system_prompt', value: { chat: 'p', translate: 't' } },
      { key: 'title_generation', value: { providerId: 'p1', modelId: 'm', prompt: 'x' } },
    ])
    expect(notifications).toEqual([{ id: 'n', title: 'T', content: 'C', level: 'warning' }])
  })

  it('orders parents before children and re-roots orphans', () => {
    const { rows, orphans } = topoSort([
      { id: 'c', parentId: 'b' },
      { id: 'b', parentId: 'a' },
      { id: 'a', parentId: null },
      { id: 'x', parentId: 'missing' },
    ])
    const index = (id: string) => rows.findIndex((r) => r.id === id)
    expect(index('a')).toBeLessThan(index('b'))
    expect(index('b')).toBeLessThan(index('c'))
    expect(rows.find((r) => r.id === 'x')!.parentId).toBeNull()
    expect(orphans).toBe(1)
  })
})
