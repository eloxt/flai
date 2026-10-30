import { explainSchema } from '@flai/shared'
import { toAISdkStream } from '@mastra/ai-sdk'
import { createUIMessageStreamResponse } from 'ai'
import { Hono } from 'hono'
import { userFacingError } from '../lib/errors'
import { type AppEnv, body } from '../lib/hono'
import { getChatAgent } from '../llm/agent'
import { alertLlmError } from '../llm/error-alert'
import { oneShotOptions } from '../llm/one-shot'
import { resolveModel } from '../services/providers'

export const explainRoutes = new Hono<AppEnv>().post('/explain', async (c) => {
  const input = await body(c, explainSchema)
  const target = resolveModel(input.model.providerId, input.model.modelId, { user: true })

  const instructions = `Explain what the user's selected text means in ${input.language}. Be concise: a definition or a short paragraph, no preamble. Use the surrounding message only to pick the right sense.`
  const prompt = `Selected text:\n${input.text}${input.context ? `\n\nMessage it was selected from:\n${input.context}` : ''}`

  const stream = await getChatAgent().stream([{ role: 'user', content: prompt }] as never, {
    ...oneShotOptions(target, instructions),
    abortSignal: c.req.raw.signal,
    onError: ({ error }) => alertLlmError('explain', target, error),
  })
  const ui = toAISdkStream(stream, {
    from: 'agent',
    version: 'v7',
    sendReasoning: false,
    onError: (error) => userFacingError(error, target.provider.apiKey),
  })
  return createUIMessageStreamResponse({ stream: ui as never })
})
