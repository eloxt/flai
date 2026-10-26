import { describe, expect, it } from 'vitest'
import { chunkText } from '../src/llm/embedding-index'

describe('chunkText', () => {
  it('keeps short text as one chunk with whitespace collapsed', () => {
    expect(chunkText('  hello\n\n world  ')).toEqual(['hello world'])
    expect(chunkText(' \n ')).toEqual([])
  })

  it('splits long text into overlapping chunks that end at a break', () => {
    const sentence = '这是一个用于测试分块的句子。'
    const chunks = chunkText(sentence.repeat(300))
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1500)
    for (const chunk of chunks.slice(0, -1)) expect(chunk.endsWith('。')).toBe(true)
    expect(chunks[1]!.startsWith(chunks[0]!.slice(-200))).toBe(true)
  })

  it('caps how much of a very long message is embedded', () => {
    expect(chunkText('x'.repeat(100_000))).toHaveLength(20)
  })
})
