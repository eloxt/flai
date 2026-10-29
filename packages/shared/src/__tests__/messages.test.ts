import { describe, expect, it } from 'vitest'
import { canReplyTo, type FlaiPart, pendingQuestion } from '../messages'

const question = (toolCallId: string, state: 'input-available' | 'output-available') =>
  ({ type: 'dynamic-tool', toolName: 'ask_user', toolCallId, state, input: {}, output: {} }) as FlaiPart

describe('questions', () => {
  it('finds the first question still waiting for an answer', () => {
    const parts = [{ type: 'text', text: 'Which one?' } as FlaiPart, question('a', 'output-available'), question('b', 'input-available')]
    expect(pendingQuestion(parts)).toMatchObject({ toolCallId: 'b' })
    expect(pendingQuestion([question('a', 'output-available')])).toBeUndefined()
  })

  it('lets a reply continue only once every question is answered', () => {
    expect(canReplyTo({ role: 'assistant', parts: [question('a', 'output-available')] })).toBe(true)
    expect(canReplyTo({ role: 'assistant', parts: [question('a', 'output-available'), question('b', 'input-available')] })).toBe(false)
  })
})
