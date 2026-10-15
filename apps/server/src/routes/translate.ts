import { translateSchema } from '@flai/shared'
import { toAISdkStream } from '@mastra/ai-sdk'
import { createUIMessageStreamResponse, type ModelMessage } from 'ai'
import { Hono } from 'hono'
import { badRequest } from '../lib/errors'
import { type AppEnv, body } from '../lib/hono'
import { chatContext, getChatAgent } from '../llm/agent'
import { alertLlmError } from '../llm/error-alert'
import { userFacingError } from '../llm/generation'
import { buildModel } from '../llm/models'
import { resolveModel } from '../services/providers'
import { getSetting } from '../services/settings'
import { ownedFiles } from './files'

const IMAGE_ONLY_TEXT = 'Translate the text content of the attached image(s).'

export const translateRoutes = new Hono<AppEnv>().post('/translate', async (c) => {
  const user = c.get('user')
  const input = await body(c, translateSchema)
  const { provider, model } = resolveModel(input.model.providerId, input.model.modelId)
  if (!input.text.trim() && input.imageFileIds.length === 0) throw badRequest('Nothing to translate')
  const images = await ownedFiles(user.id, input.imageFileIds)
  if (images.some((f) => !f.mediaType.startsWith('image/'))) throw badRequest('Only images can be translated')
  if (images.length > 0 && !model.attachment) throw badRequest('This model does not accept images')

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

  const resolved = buildModel({ provider, model, options: { thinking: model.thinkingLevels[0] } })
  const alert = (error: unknown) =>
    alertLlmError({ operation: 'translate', providerName: provider.name, modelId: model.id, apiKey: provider.apiKey }, error)
  const stream = await getChatAgent().stream(messages as never, {
    requestContext: chatContext({ model: resolved.model, instructions: '' }),
    providerOptions: resolved.providerOptions as never,
    abortSignal: c.req.raw.signal,
    onError: ({ error }) => alert(error),
  })
  const ui = toAISdkStream(stream, {
    from: 'agent',
    version: 'v7',
    sendReasoning: false,
    onError: (error) => userFacingError(error, provider.apiKey),
  })
  return createUIMessageStreamResponse({ stream: ui as never })
})
