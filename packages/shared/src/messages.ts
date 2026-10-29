import type { UIMessage, UIMessagePart, UITools } from 'ai'
import { z } from 'zod'
import type { ChatOptions } from './api'

export const askUserQuestionSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.object({ label: z.string().min(1), description: z.string().optional() })).optional(),
  selectionMode: z.enum(['single_select', 'multi_select']).optional(),
})
export type AskUserQuestion = z.infer<typeof askUserQuestionSchema>

/** Multi-select questions (with options to pick from) take an array of answers; the rest take one string. */
export const isMultiSelect = (question: AskUserQuestion) =>
  question.selectionMode === 'multi_select' && Boolean(question.options?.length)

export const askUserAnswerSchema = z.union([
  z.string().trim().min(1).max(20_000),
  z.array(z.string().trim().min(1).max(2000)).min(1).max(32)
    .refine((answers) => new Set(answers).size === answers.length, 'Answers must be unique'),
])
export type AskUserAnswer = z.infer<typeof askUserAnswerSchema>

export const askUserResultSchema = z.object({ answer: askUserAnswerSchema, content: z.string(), isError: z.literal(false) })

export interface GoogleGrounding {
  webSearchQueries?: string[]
  searchEntryPoint?: { renderedContent?: string }
  groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
  groundingSupports?: Array<{
    segment?: { startIndex?: number; endIndex?: number; text?: string }
    groundingChunkIndices?: number[]
  }>
}

export interface MessageUsage {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
  /** Legacy (Go backend) only: tokens spent on tool use prompts. */
  toolUseTokens?: number
}

export interface MessageMetadata {
  providerId?: string
  providerName?: string
  modelId?: string
  /** Retain the original settings when continuing after a question. */
  chatOptions?: ChatOptions
  usage?: MessageUsage
  googleGrounding?: GoogleGrounding
  /** Base64 Gemini thought signature carried over from the legacy backend. */
  thoughtSignature?: string
  /** Set when the generation was stopped by the user. */
  aborted?: boolean
}

// No custom data parts yet; kept as a named alias so adding one is a single edit.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FlaiDataParts = {}

export type FlaiUIMessage = UIMessage<MessageMetadata, FlaiDataParts>
export type FlaiPart = UIMessagePart<FlaiDataParts, UITools>

export type AskUserPart = Extract<FlaiPart, { toolCallId: string }>

export function isAskUserPart(part: FlaiPart): part is AskUserPart {
  return part.type === 'tool-ask_user' || (part.type === 'dynamic-tool' && part.toolName === 'ask_user')
}

/** The first question in `parts` still waiting for the user's answer. */
export function pendingQuestion(parts: FlaiPart[]): AskUserPart | undefined {
  return parts.find((p): p is AskUserPart => isAskUserPart(p) && p.state === 'input-available')
}

/** Whether the message asked questions and every one of them has been answered. */
export function questionsAnswered(parts: FlaiPart[]): boolean {
  const questions = parts.filter(isAskUserPart)
  return questions.length > 0 && questions.every((p) => p.state === 'output-available')
}

/** A reply can continue a user turn, or an assistant turn whose questions are all answered. */
export function canReplyTo(message: { role: 'user' | 'assistant'; parts: FlaiPart[] }): boolean {
  return message.role === 'user' || questionsAnswered(message.parts)
}

/** Extra data we attach to user file parts via providerMetadata.flai. */
export interface FlaiFileMeta {
  fileId: string
  size?: number
}

export function fileMetaOf(part: { providerMetadata?: unknown }): FlaiFileMeta | undefined {
  const meta = (part.providerMetadata as { flai?: FlaiFileMeta } | undefined)?.flai
  return meta?.fileId ? meta : undefined
}

/** The message part for an uploaded file. */
export function toFilePart(file: { id: string; name: string; mediaType: string; size: number; url: string }): FlaiPart {
  return {
    type: 'file',
    mediaType: file.mediaType,
    filename: file.name,
    url: file.url,
    providerMetadata: { flai: { fileId: file.id, size: file.size } },
  }
}

/** A persisted node of a conversation's message tree. */
export interface MessageRecord {
  id: string
  parentId: string | null
  role: 'user' | 'assistant'
  parts: FlaiPart[]
  metadata: MessageMetadata
  createdAt: string
}

/** Plain text of a message, used for previews, titles and search. */
export function textOf(parts: readonly { type: string; text?: string }[]): string {
  return parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('\n')
}
