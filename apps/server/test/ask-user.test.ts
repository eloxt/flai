import { askUserResultSchema, isAskUserPart, type FlaiUIMessage } from '@flai/shared'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { toAISdkStream } from '@mastra/ai-sdk'
import { Agent } from '@mastra/core/agent'
import { askUserTool, formatQuestionAnswer } from '@mastra/core/tools'
import { readUIMessageStream } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import { toModelMessages } from '../src/llm/history'

describe('ask_user client tool', () => {
  it.each([
    { question: 'Which language?', options: [{ label: 'English' }, { label: '中文' }], answer: '中文' },
    { question: 'Which features?', options: [{ label: 'Search' }, { label: 'Files' }], selectionMode: 'multi_select', answer: ['Search', 'Files'] },
    { question: 'What should I call you?', answer: 'Alex' },
  ])('waits for an answer and continues with persisted tool history: $question', async ({ answer, ...question }) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string)
      const answered = body.messages.some((m: { role: string }) => m.role === 'tool')
      const deltas = answered ? [{ content: 'Thanks, continuing.' }] : [
        { content: 'First, a question.' },
        { tool_calls: [{ index: 0, id: 'question-1', type: 'function', function: { name: 'ask_user', arguments: JSON.stringify(question) } }] },
      ]
      const chunks = [...deltas.map((delta) => ({ delta, finish_reason: null })), {
        delta: {}, finish_reason: answered ? 'stop' : 'tool_calls',
      }].map((choice) => `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, ...choice }] })}\n\n`).join('')
      return new Response(`${chunks}data: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
    })
    const provider = createOpenAICompatible({ name: 'test', apiKey: 'test', baseURL: 'https://llm.example.com/v1', fetch })
    const agent = new Agent({ id: 'test', name: 'Test', instructions: 'Ask the user.', model: provider.chatModel('test') })
    const stream = await agent.stream('Help me.', { clientTools: { ask_user: askUserTool }, maxSteps: 10 })
    let message: FlaiUIMessage | undefined
    for await (const snapshot of readUIMessageStream<FlaiUIMessage>({
      stream: toAISdkStream(stream, { from: 'agent', version: 'v7' }),
    })) message = snapshot

    expect(fetch).toHaveBeenCalledOnce()
    expect(message?.parts.filter((p) => p.type !== 'step-start').map((p) => p.type)).toEqual(['text', 'tool-ask_user'])
    const part = message!.parts.find(isAskUserPart)!
    expect(part).toMatchObject({ state: 'input-available', input: question, toolCallId: 'question-1' })
    if (part.state !== 'input-available') throw new Error('Expected a pending question')

    const output = askUserResultSchema.parse({ answer, content: `User answered: ${formatQuestionAnswer(answer)}`, isError: false })
    const parts = message!.parts.map((p) => p === part ? { ...part, state: 'output-available' as const, output } : p)
    const history = await toModelMessages([{
      id: 'assistant', parentId: null, conversationId: 'conversation', role: 'assistant', parts,
      metadata: {}, searchText: '', tsv: null, createdAt: new Date(), deletedAt: null,
    }], 'openai_completion')
    const continuation = await agent.stream(history as never, { clientTools: { ask_user: askUserTool }, maxSteps: 10 })
    let text = ''
    for await (const delta of continuation.textStream) text += delta
    expect(text).toBe('Thanks, continuing.')
    expect(fetch).toHaveBeenCalledTimes(2)
    const sent = JSON.parse(fetch.mock.calls[1]![1]!.body as string)
    expect(sent.messages).toContainEqual(expect.objectContaining({
      role: 'tool', tool_call_id: 'question-1', content: expect.stringContaining(formatQuestionAnswer(answer)),
    }))
  })
})
