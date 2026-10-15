import type { UIMessage, UIMessagePart, UITools } from 'ai'

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

/** Extra data we attach to user file parts via providerMetadata.flai. */
export interface FlaiFileMeta {
  fileId: string
  size?: number
}

export function fileMetaOf(part: { providerMetadata?: unknown }): FlaiFileMeta | undefined {
  const meta = (part.providerMetadata as { flai?: FlaiFileMeta } | undefined)?.flai
  return meta?.fileId ? meta : undefined
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
