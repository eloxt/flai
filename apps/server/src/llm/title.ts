import { textOf } from '@flai/shared'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '../db'
import { AppError } from '../lib/errors'
import { escapeXml } from '../lib/text'
import { resolveModel } from '../services/providers'
import { getSetting } from '../services/settings'
import { chatContext, getChatAgent } from './agent'
import { alertLlmError } from './error-alert'
import { buildModel } from './models'

const TITLE_TIMEOUT_MS = 2 * 60 * 1000
const MAX_INPUT_CHARS = 8000

const titleSchema = z.object({
  icon: z.string().describe('A single emoji that represents the conversation'),
  title: z.string().describe('A short title for the conversation'),
})

/** Generate `{ title, icon }` for a conversation from `content` or its first message. */
export async function generateTitle(conversationId: string, content?: string): Promise<{ title: string; icon: string }> {
  const settings = getSetting('title_generation')
  if (!settings.providerId || !settings.modelId) throw new AppError('NOT_CONFIGURED', 'Title generation is not configured')
  const { provider, model } = resolveModel(settings.providerId, settings.modelId)

  let input = content?.trim()
  if (!input) {
    const m = schema.messages
    const first = await db.query.messages.findFirst({
      where: and(eq(m.conversationId, conversationId), eq(m.role, 'user'), isNull(m.deletedAt)),
      orderBy: [asc(m.createdAt), asc(m.id)],
      columns: { parts: true },
    })
    input = first ? textOf(first.parts) : ''
  }
  if (!input) throw new AppError('BAD_REQUEST', 'Nothing to generate a title from')

  const prompt = `<chat_history>\n<message role="user">${escapeXml(input.slice(0, MAX_INPUT_CHARS))}</message>\n</chat_history>`
  const resolved = buildModel({ provider, model, options: { thinking: model.thinkingLevels[0] } })
  try {
    const result = await getChatAgent().generate(prompt, {
      requestContext: chatContext({ model: resolved.model, instructions: settings.prompt }),
      providerOptions: resolved.providerOptions as never,
      structuredOutput: { schema: titleSchema },
      abortSignal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
    })
    const object = result.object as z.infer<typeof titleSchema>
    return { title: object.title.trim().slice(0, 200) || 'Untitled', icon: [...object.icon.trim()].slice(0, 2).join('') }
  } catch (error) {
    console.error('title generation failed', error)
    alertLlmError({ operation: 'title', providerName: provider.name, modelId: model.id, apiKey: provider.apiKey }, error)
    throw new AppError('UPSTREAM', 'Title generation failed')
  }
}
