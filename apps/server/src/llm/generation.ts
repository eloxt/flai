import type { ChatOptions, FlaiPart, FlaiUIMessage, GoogleGrounding, MessageMetadata, ModelConfig } from '@flai/shared'
import { textOf } from '@flai/shared'
import { toAISdkStream } from '@mastra/ai-sdk'
import { readUIMessageStream, type UIMessageChunk } from 'ai'
import { db, schema } from '../db'
import { AppError, errorMessage } from '../lib/errors'
import type { MessageRow } from '../services/conversations'
import { touchConversation } from '../services/conversations'
import type { ProviderRow } from '../services/providers'
import { chatContext, chatInstructions, getChatAgent } from './agent'
import { alertLlmError } from './error-alert'
import { toModelMessages } from './history'
import { buildMcpToolset } from './mcp'
import { buildModel } from './models'

type Chunk = UIMessageChunk<MessageMetadata>
type Listener = (chunk: Chunk | null) => void

const GENERATION_TIMEOUT_MS = 20 * 60 * 1000
const MAX_STEPS = 10

/**
 * One in-flight assistant reply. Generation runs independently of any HTTP connection:
 * chunks are fanned out to whoever is listening, and the message is persisted when the
 * model finishes (or is stopped) even if every client has gone away.
 */
class Generation {
  readonly controller = new AbortController()
  private readonly backlog: Chunk[] = []
  private readonly listeners = new Set<Listener>()
  private closed = false
  stoppedByUser = false

  constructor(
    readonly assistantId: string,
    readonly userId: string,
    readonly conversationId: string,
  ) {}

  emit(chunk: Chunk): void {
    if (this.closed) return
    this.backlog.push(chunk)
    for (const listener of this.listeners) listener(chunk)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const listener of this.listeners) listener(null)
    this.listeners.clear()
  }

  /** A UI message stream replaying everything so far, then following live chunks. */
  subscribe(): ReadableStream<Chunk> {
    let listener: Listener | undefined
    return new ReadableStream<Chunk>({
      start: (controller) => {
        for (const chunk of this.backlog) controller.enqueue(chunk)
        if (this.closed) return controller.close()
        listener = (chunk) => (chunk ? controller.enqueue(chunk) : controller.close())
        this.listeners.add(listener)
      },
      cancel: () => {
        // The client went away; generation carries on.
        if (listener) this.listeners.delete(listener)
      },
    })
  }
}

const registry = new Map<string, Generation>()

export function cancelGeneration(assistantId: string, userId: string): boolean {
  const generation = registry.get(assistantId)
  if (!generation || generation.userId !== userId) return false
  generation.stoppedByUser = true
  generation.controller.abort()
  return true
}

export interface StartGenerationInput {
  userId: string
  conversationId: string
  assistantId: string
  /** Root→leaf history ending with the user message being answered. */
  path: MessageRow[]
  provider: ProviderRow
  model: ModelConfig
  options: ChatOptions
}

export function startGeneration(input: StartGenerationInput): ReadableStream<Chunk> {
  if (registry.has(input.assistantId)) throw new AppError('CONFLICT', 'A reply with this id is already being generated')
  const generation = new Generation(input.assistantId, input.userId, input.conversationId)
  registry.set(input.assistantId, generation)
  generation.emit({ type: 'start', messageId: input.assistantId })
  void run(generation, input).finally(() => registry.delete(input.assistantId))
  return generation.subscribe()
}

async function run(generation: Generation, input: StartGenerationInput): Promise<void> {
  const { provider, model, options } = input
  const timeout = setTimeout(() => generation.controller.abort(), GENERATION_TIMEOUT_MS)
  const userMessage = input.path.at(-1)!
  const baseMetadata: MessageMetadata = { providerId: provider.id, providerName: provider.name, modelId: model.id }

  // Accumulate the reply exactly as a client would, so what we store matches what was shown.
  const accumulator = new TransformStream<Chunk, Chunk>()
  const writer = accumulator.writable.getWriter()
  const finalMessage = (async () => {
    let last: FlaiUIMessage | undefined
    for await (const message of readUIMessageStream<FlaiUIMessage>({ stream: accumulator.readable })) last = message
    return last
  })()
  const forward = (chunk: Chunk) => {
    generation.emit(chunk)
    void writer.write(chunk)
  }
  void writer.write({ type: 'start', messageId: input.assistantId })

  const mcp = await buildMcpToolset(input.userId, options.mcpTools).catch((error) => {
    console.warn('failed to prepare MCP tools', error)
    return { tools: {}, close: async () => {} }
  })

  let failure: unknown
  let metadata: MessageMetadata = { ...baseMetadata }
  try {
    const resolved = buildModel({ provider, model, options, requestId: input.assistantId })
    const messages = await toModelMessages(input.path, provider.type)
    const stream = await getChatAgent().stream(messages as never, {
      requestContext: chatContext({ model: resolved.model, instructions: chatInstructions(model) }),
      providerOptions: resolved.providerOptions as never,
      toolsets: { builtin: resolved.tools, mcp: model.toolCall ? mcp.tools : {} } as never,
      maxSteps: MAX_STEPS,
      abortSignal: generation.controller.signal,
    })

    const uiStream = toAISdkStream(stream, {
      from: 'agent',
      version: 'v7',
      sendStart: false,
      sendFinish: false,
      sendReasoning: true,
      sendSources: true,
    }) as unknown as ReadableStream<Chunk>

    for await (const chunk of uiStream) {
      // Errors are reported once, after persistence, below.
      if (chunk.type === 'error') {
        failure = new Error(chunk.errorText)
        continue
      }
      if (chunk.type === 'start' || chunk.type === 'finish' || chunk.type === 'abort') continue
      forward(chunk)
    }
    if (!generation.controller.signal.aborted && !failure) {
      metadata = { ...metadata, ...(await collectMetadata(stream)) }
    }
  } catch (error) {
    if (!generation.controller.signal.aborted) failure = error
  } finally {
    clearTimeout(timeout)
    await writer.close().catch(() => {})
    await mcp.close()
  }

  const aborted = generation.controller.signal.aborted
  if (aborted) metadata.aborted = true
  if (aborted && !generation.stoppedByUser && !failure) failure = new Error('Generation timed out')

  const message = await finalMessage.catch(() => undefined)
  const parts = (message?.parts ?? []).filter((p) => p.type !== 'step-start') as FlaiPart[]

  try {
    if (parts.length === 0) {
      if (generation.stoppedByUser) {
        generation.emit({ type: 'finish', finishReason: 'stop', messageMetadata: metadata })
        return
      }
      throw failure ?? new Error('The model returned an empty response')
    }
    await db.transaction(async (tx) => {
      await tx.insert(schema.messages).values({
        id: input.assistantId,
        conversationId: input.conversationId,
        parentId: userMessage.id,
        role: 'assistant',
        parts,
        metadata,
        searchText: textOf(parts),
      })
      await touchConversation(input.conversationId, tx)
    })
    if (failure && !generation.stoppedByUser) throw failure
    generation.emit({ type: 'message-metadata', messageMetadata: metadata })
    generation.emit({ type: 'finish', finishReason: 'stop', messageMetadata: metadata })
  } catch (error) {
    console.error('generation failed', error)
    alertLlmError({ operation: 'chat', providerName: provider.name, modelId: model.id, apiKey: provider.apiKey }, error)
    // No `finish` chunk: clients treat a stream without one as failed and reload from the server.
    generation.emit({ type: 'error', errorText: userFacingError(error, provider.apiKey) })
  } finally {
    generation.close()
  }
}

async function collectMetadata(stream: {
  totalUsage: Promise<{ inputTokens?: number; outputTokens?: number; reasoningTokens?: number; cachedInputTokens?: number }>
  providerMetadata: Promise<Record<string, Record<string, unknown>> | undefined>
}): Promise<MessageMetadata> {
  const [usage, providerMetadata] = await Promise.all([
    stream.totalUsage.catch(() => undefined),
    stream.providerMetadata.catch(() => undefined),
  ])
  const grounding = providerMetadata?.google?.groundingMetadata as GoogleGrounding | null | undefined
  return {
    usage: usage
      ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          reasoningTokens: usage.reasoningTokens,
          cachedInputTokens: usage.cachedInputTokens,
        }
      : undefined,
    ...(grounding ? { googleGrounding: grounding } : {}),
  }
}

export function userFacingError(error: unknown, apiKey?: string): string {
  if (error instanceof AppError) return error.message
  let message = errorMessage(error).slice(0, 500)
  if (apiKey) message = message.replaceAll(apiKey, '[REDACTED]')
  return message ? `Generation failed: ${message}` : 'Generation failed. Please retry.'
}
