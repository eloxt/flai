import type { SettingValue } from '@flai/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageRow } from '../src/services/conversations'

let settings: SettingValue<'topic_check'>
vi.mock('../src/services/settings', () => ({ getSetting: () => settings }))
const { isOffTopic, verifyTypeSafe } = await import('../src/llm/topic-check')

const fetchMock = vi.fn<typeof fetch>()
const row = (role: 'user' | 'assistant', text: string) => ({ role, parts: [{ type: 'text', text }] }) as unknown as MessageRow
const path = [row('user', 'How do I bake sourdough?'), row('assistant', 'Start with a levain…')]
const answer = (noul: number) => Response.json({ model: 'jev-1.14.0', answers: { topic_shift: { type: 'noul', noul } }, usage: { input_tokens: 1, output_tokens: 1 } })

beforeEach(() => {
  settings = { enabled: true, baseUrl: 'https://api.typesafe.ai', apiKey: 'ts-key', model: 'jev-latest', threshold: 0.8 }
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async () => answer(0.9))
})
afterEach(() => vi.unstubAllGlobals())

describe('topic check', () => {
  it('asks Jev one noul question about the recent conversation', async () => {
    expect(await isOffTopic('Bread', path, 'What is the capital of Peru?')).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(init?.headers).toMatchObject({ authorization: 'Bearer ts-key' })
    const request = JSON.parse(init!.body as string)
    expect(request.model).toBe('jev-latest')
    expect(request.state).toEqual({
      conversation_title: 'Bread',
      conversation: [{ role: 'user', text: 'How do I bake sourdough?' }, { role: 'assistant', text: 'Start with a levain…' }],
      new_message: 'What is the capital of Peru?',
    })
    expect(request.questions.topic_shift.type).toBe('noul')
  })

  it('sends requests to the configured base URL', async () => {
    settings.baseUrl = 'https://typesafe.proxy.internal/api'
    await isOffTopic('Bread', path, 'x')
    expect(fetchMock.mock.calls[0]![0]).toBe('https://typesafe.proxy.internal/api/v1/systemone')
  })

  it('only asks the user at or above the threshold', async () => {
    fetchMock.mockImplementation(async () => answer(0.79))
    expect(await isOffTopic('Bread', path, 'And rye?')).toBe(false)
  })

  it('lets the message through when off, unconfigured, empty or failing', async () => {
    settings.enabled = false
    expect(await isOffTopic('Bread', path, 'x')).toBe(false)
    settings = { ...settings, enabled: true, apiKey: '' }
    expect(await isOffTopic('Bread', path, 'x')).toBe(false)
    settings.apiKey = 'ts-key'
    expect(await isOffTopic('Bread', [], 'x')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockImplementation(async () => new Response('{}', { status: 529 }))
    expect(await isOffTopic('Bread', path, 'x')).toBe(false)
    fetchMock.mockRejectedValue(new TypeError('network'))
    expect(await isOffTopic('Bread', path, 'x')).toBe(false)
    fetchMock.mockImplementation(async () => Response.json({ answers: {} }))
    expect(await isOffTopic('Bread', path, 'x')).toBe(false)
  })

  it('verifies the key and model on save', async () => {
    fetchMock.mockImplementation(async () => Response.json({ models: [{ name: 'jev-latest', description: '', release_date: '2026-09-15' }] }))
    await expect(verifyTypeSafe(settings, 'jev-latest')).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.typesafe.ai/v1/models')
    await expect(verifyTypeSafe(settings, 'jev-0')).rejects.toThrow('TypeSafe model not found: jev-0')
    fetchMock.mockImplementation(async () => new Response('{}', { status: 401 }))
    await expect(verifyTypeSafe({ ...settings, apiKey: 'bad' }, 'jev-latest')).rejects.toThrow('Invalid TypeSafe API key (HTTP 401)')
  })
})
