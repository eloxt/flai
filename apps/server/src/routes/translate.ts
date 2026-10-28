import { translateSchema } from '@flai/shared'
import { toAISdkStream } from '@mastra/ai-sdk'
import { createUIMessageStreamResponse, type ModelMessage } from 'ai'
import { Hono } from 'hono'
import { badRequest, userFacingError } from '../lib/errors'
import { type AppEnv, body } from '../lib/hono'
import { getChatAgent } from '../llm/agent'
import { alertLlmError } from '../llm/error-alert'
import { oneShotOptions } from '../llm/one-shot'
import { ownedFiles } from '../services/files'
import { resolveModel } from '../services/providers'
import { getSetting } from '../services/settings'

const IMAGE_ONLY_TEXT = 'Translate the text content of the attached image(s).'

export const translateRoutes = new Hono<AppEnv>().post('/translate', async (c) => {
  const user = c.get('user')
  const input = await body(c, translateSchema)
  const target = resolveModel(input.model.providerId, input.model.modelId)
  if (!input.text.trim() && input.imageFileIds.length === 0) throw badRequest('Nothing to translate')
  const images = await ownedFiles(user.id, input.imageFileIds)
  if (images.some((f) => !f.mediaType.startsWith('image/'))) throw badRequest('Only images can be translated')
  if (images.length > 0 && !target.model.attachment) throw badRequest('This model does not accept images')

  let prompt = getSetting('system_prompt')
    .translate.replaceAll('{{sourceLanguage}}', input.source)
    .replaceAll('{{targetLanguage}}', input.target)
    .replaceAll('{{text}}', input.text.trim() || IMAGE_ONLY_TEXT)
  if (!prompt.trim()) prompt = `Translate from ${input.source} to ${input.target}. Output only the translation.\n\n${input.text}`
  if (input.instruction) prompt += `\n\nAdditional style requirements from the user: ${input.instruction}`

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        ...images.map((f) => ({ type: 'image' as const, image: new URL(f.url), mediaType: f.mediaType })),
      ],
    },
  ]

  const stream = await getChatAgent().stream(messages as never, {
    ...oneShotOptions(target, ''),
    abortSignal: c.req.raw.signal,
    onError: ({ error }) => alertLlmError('translate', target, error),
  })
  const ui = toAISdkStream(stream, {
    from: 'agent',
    version: 'v7',
    sendReasoning: false,
    onError: (error) => userFacingError(error, target.provider.apiKey),
  })
  return createUIMessageStreamResponse({ stream: ui as never })
})
