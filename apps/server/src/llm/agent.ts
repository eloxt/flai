import { buildGenuiPrompt } from '@flai/shared/genui'
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { RequestContext } from '@mastra/core/request-context'
import type { ModelConfig } from '@flai/shared'
import type { MemoryRow } from '../services/memories'
import { getSetting } from '../services/settings'
import type { ResolvedModel } from './models'
import { memoryPrompt } from './user-memory'

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

// en-CA formats as YYYY-MM-DD.
const promptDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' })

let genuiPrompt: string | undefined

/** The OpenUI component reference, built once from the official library specification. */
export function getGenuiPrompt(): string {
  genuiPrompt ??= buildGenuiPrompt()
  return genuiPrompt
}

export interface ChatInstructionOptions {
  chatHistory?: boolean
  /** The user's saved memories, oldest first; empty when memory is off. */
  memories?: MemoryRow[]
  /** Whether the memory tools are offered. */
  memoryWrite?: boolean
  now?: Date
}

export function chatInstructions(model: ModelConfig, { chatHistory = false, memories = [], memoryWrite = false, now = new Date() }: ChatInstructionOptions = {}): string {
  const base = getSetting('system_prompt').chat.replaceAll('{{currentDate}}', promptDate.format(now))
  return [
    base,
    // Right after the system prompt, and only changing when memories do, so the prefix caches well.
    memoryPrompt(memories),
    model.toolCall && 'Use ask_user when you need clarification or a decision from the user. Ask in the user’s language, provide concise choices when helpful, and wait for the answer before continuing.',
    model.toolCall && chatHistory && 'Use search_chats and read_chat to recall the user’s earlier conversations when they refer to something discussed before or when past context would clearly help; don’t mention them otherwise.',
    model.toolCall && memoryWrite && 'Use save_memory when the user shares a lasting fact or preference about themselves or asks you to remember something; use update_memory or delete_memory, with ids from the saved memories, when one changes or the user asks you to forget it. Keep one fact per memory and say briefly what you saved.',
    model.generativeUi && getGenuiPrompt(),
  ].filter(Boolean).join('\n\n')
}
