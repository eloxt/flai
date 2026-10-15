import { createGenuiLibrary, GENUI_ORDER, buildGenuiPrompt } from '@flai/shared/genui'
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { RequestContext } from '@mastra/core/request-context'
import type { ModelConfig } from '@flai/shared'
import { getSetting } from '../services/settings'
import type { ResolvedModel } from './models'

/** Values the chat agent reads from the per-request context. */
export interface ChatRequestContext {
  model: ResolvedModel['model']
  instructions: string
}

// Mastra rejects empty instructions; used when no system prompt is configured.
const FALLBACK_INSTRUCTIONS = 'You are a helpful assistant.'

const chatAgent = new Agent<'chat', Record<string, never>, undefined, ChatRequestContext>({
  id: 'chat',
  name: 'Flai',
  instructions: ({ requestContext }) => requestContext.get('instructions').trim() || FALLBACK_INSTRUCTIONS,
  model: ({ requestContext }) => requestContext.get('model'),
})

export const mastra = new Mastra({ agents: { chat: chatAgent }, logger: false })

export const getChatAgent = () => mastra.getAgent('chat')

export function chatContext(values: ChatRequestContext): RequestContext<ChatRequestContext> {
  const ctx = new RequestContext<ChatRequestContext>()
  ctx.set('model', values.model)
  ctx.set('instructions', values.instructions)
  return ctx
}

let genuiPrompt: string | undefined

/** The OpenUI component reference, built once from the shared catalogue. */
export function getGenuiPrompt(): string {
  genuiPrompt ??= buildGenuiPrompt(
    createGenuiLibrary(Object.fromEntries(GENUI_ORDER.map((name) => [name, null])) as Record<(typeof GENUI_ORDER)[number], null>),
  )
  return genuiPrompt
}

export function chatInstructions(model: ModelConfig, now = new Date()): string {
  const base = getSetting('system_prompt').chat.replaceAll('{{currentDateTime}}', now.toISOString())
  return model.generativeUi ? [base, getGenuiPrompt()].filter(Boolean).join('\n\n') : base
}
