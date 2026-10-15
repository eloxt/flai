import { describe, expect, it } from 'vitest'
import { geminiBaseUrl } from '../src/llm/models'

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
