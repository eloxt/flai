import { describe, expect, it } from 'vitest'
import { highlight } from '../src/lib/highlight'

describe('highlight', () => {
  it('keeps whitespace and wraps every match case-insensitively', () => {
    expect(highlight('Hello Mock world, mock!', ['mock'])).toBe('Hello <em>Mock</em> world, <em>mock</em>!')
  })

  it('handles CJK terms and builds a snippet around the first match', () => {
    const text = `${'前'.repeat(100)}东京之旅${'后'.repeat(200)}`
    const out = highlight(text, ['东京'], 10)
    expect(out.startsWith('…')).toBe(true)
    expect(out).toContain('<em>东京</em>之旅')
    expect(out.endsWith('…')).toBe(true)
  })

  it('escapes regex characters in terms', () => {
    expect(highlight('a+b (c)', ['a+b', '(c)'])).toBe('<em>a+b</em> <em>(c)</em>')
  })
})
