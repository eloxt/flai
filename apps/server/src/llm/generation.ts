import type { ChatOptions, FlaiPart, FlaiUIMessage, GoogleGrounding, MessageMetadata, ModelConfig } from '@flai/shared'
import { textOf } from '@flai/shared'
import { toAISdkStream } from '@mastra/ai-sdk'
import { askUserTool } from '@mastra/core/tools'
import { readUIMessageStream } from 'ai'
import { db, schema } from '../db'
import { AppError, errorMessage } from '../lib/errors'
import type { MessageRow } from '../services/conversations'
import { touchConversation } from '../services/conversations'
import type { ProviderRow } from '../services/providers'
import { chatContext, chatInstructions, getChatAgent } from './agent'
import { createChatHistoryTools, loadPastChats } from './chat-history'
import { nudgeEmbeddingIndexer } from './embedding-index'
import { alertLlmError } from './error-alert'
import { toModelMessages } from './history'
import { loadMemories, queryEmbedding, withContext } from './memory-retrieval'
import { buildMcpToolset } from './mcp'
import { buildModel } from './models'
import { exaResponseSchema } from './exa'
import { type CancelReason, type Chunk, generationBus, HEARTBEAT_MS } from './stream-bus'
import { createMemoryTools, type MemoryAccess, memoryLabels, relevantMemoriesPrompt } from './user-memory'

const GENERATION_TIMEOUT_MS = 20 * 60 * 1000
const MAX_STEPS = 10
/**
 * Tool calls from one step run in parallel. The "called" strategy keeps a batch sequential only
 * when it includes a suspending tool (ask_user); merely registering one would serialize every step.
 */
const TOOL_CALL_CONCURRENCY = { limit: 8, strategy: 'called' } as const
/** How long shutdown waits for in-flight replies to save what they have. */
const SHUTDOWN_GRACE_MS = 15_000

/**
 * Why a reply ended early: the user pressed stop (keep what was written), its conversation
 * was deleted (discard), the server is shutting down (keep it), or it ran too long.
 */
type StopReason = CancelReason | 'shutdown' | 'timeout'

/**
 * A reply this process is generating. Generation runs independently of any HTTP connection:
 * chunks go to the generation bus, where any client (on any instance) can replay and follow
 * them, and the message is persisted when the model finishes or is stopped.
 */
interface Generation {
  readonly assistantId: string
  readonly controller: AbortController
  done: Promise<void>
}

const running = new Map<string, Generation>()
let shuttingDown = false

function stopReason(generation: Generation): StopReason | null {
  return generation.controller.signal.aborted ? (generation.controller.signal.reason as StopReason) : null
}

function abortLocal(assistantId: string, reason: StopReason) {
  const generation = running.get(assistantId)
  if (generation && !generation.controller.signal.aborted) generation.controller.abort(reason)
}

/** Stop a reply wherever it runs: directly when this process owns it, otherwise through the bus. */
async function requestStop(assistantId: string, reason: CancelReason) {
  abortLocal(assistantId, reason)
  if (!running.has(assistantId)) await generationBus().requestCancel(assistantId, reason)
}

let listening: Promise<void> | undefined
function listenForCancels(): Promise<void> {
  listening ??= generationBus()
    .onCancel((assistantId, reason) => abortLocal(assistantId, reason))
    .catch((error: Error) => {
      // Cancels still arrive through the heartbeat's flag check, just a little later.
      console.warn('failed to listen for cancel requests', error.message)
    })
  return listening
}

export type CancelResult = 'requested' | 'finished' | 'not-found'

/** Ask the reply to stop, wherever it is running. Stopping a finished reply is a no-op. */
export async function cancelGeneration(assistantId: string, userId: string, reason: CancelReason = 'user'): Promise<CancelResult> {
  const info = await generationBus().info(assistantId)
  if (!info || info.userId !== userId) return 'not-found'
  if (info.done) return 'finished'
  await requestStop(assistantId, reason)
  return 'requested'
}

/** Stop the conversation's in-flight reply, e.g. because the conversation or its branch is deleted. */
export async function cancelConversationGeneration(conversationId: string, options: { parentIds?: string[] } = {}): Promise<void> {
  const info = await generationBus().active(conversationId)
  if (!info || (options.parentIds && !options.parentIds.includes(info.parentId))) return
  await requestStop(info.assistantId, 'discard')
}

export async function activeGeneration(conversationId: string): Promise<{ assistantId: string; parentId: string } | null> {
  const info = await generationBus().active(conversationId)
  return info ? { assistantId: info.assistantId, parentId: info.parentId } : null
}

/**
 * Stop accepting replies, end in-flight ones (saving what they have, so clients that
 * reconnect after the restart find them), then release the bus.
 */
export async function shutdownGenerations(): Promise<void> {
  shuttingDown = true
  for (const id of running.keys()) abortLocal(id, 'shutdown')
  const all = Promise.allSettled([...running.values()].map((g) => g.done))
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS).unref())])
  await generationBus().shutdown()
}

export interface StartGenerationInput {
  userId: string
  conversationId: string
  assistantId: string
  /** Root→leaf history ending with the user turn or answered question being continued. */
  path: MessageRow[]
  provider: ProviderRow
  model: ModelConfig
  options: ChatOptions
  /** Whether the model may search and read the user's other conversations. */
  chatHistory: boolean
  memory: MemoryAccess
}

/** Start generating a reply in the background. Read it with `generationBus().read(assistantId, "0", …)`. */
export async function startGeneration(input: StartGenerationInput): Promise<void> {
  if (shuttingDown) throw new AppError('UNAVAILABLE', 'The server is restarting, please retry in a moment')
  const bus = generationBus()
  await listenForCancels()
  const opened = await bus.open({
    assistantId: input.assistantId,
    userId: input.userId,
    conversationId: input.conversationId,
    parentId: input.path.at(-1)!.id,
  })
  if (!opened) throw new AppError('CONFLICT', 'A reply with this id is already being generated')
  const generation: Generation = { assistantId: input.assistantId, controller: new AbortController(), done: Promise.resolve() }
  running.set(input.assistantId, generation)
  bus.append(input.assistantId, { type: 'start', messageId: input.assistantId })

  // Keep the lease alive and pick up cancel requests that missed the pub/sub message.
  const heartbeat = setInterval(() => {
    bus
      .heartbeat(input.assistantId)
      .then((reason) => reason && abortLocal(input.assistantId, reason))
      .catch((error: Error) => console.warn('generation heartbeat failed', error.message))
  }, HEARTBEAT_MS)
  heartbeat.unref()

  generation.done = run(generation, input).finally(() => {
    clearInterval(heartbeat)
    running.delete(input.assistantId)
  })
}

async function run(generation: Generation, input: StartGenerationInput): Promise<void> {
  const bus = generationBus()
  const emit = (chunk: Chunk) => bus.append(input.assistantId, chunk)
  const { provider, model, options } = input
  const timeout = setTimeout(() => generation.controller.abort('timeout' satisfies StopReason), GENERATION_TIMEOUT_MS)
  const parentMessage = input.path.at(-1)!
  const baseMetadata: MessageMetadata = { providerId: provider.id, providerName: provider.name, modelId: model.id, chatOptions: options }

  // Accumulate the reply exactly as a client would, so what we store matches what was shown.
  const accumulator = new TransformStream<Chunk, Chunk>()
  const writer = accumulator.writable.getWriter()
  const finalMessage = (async () => {
    let last: FlaiUIMessage | undefined
    for await (const message of readUIMessageStream<FlaiUIMessage>({ stream: accumulator.readable })) last = message
    return last
  })()
  const forward = (chunk: Chunk) => {
    emit(chunk)
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
    const chatHistory = model.toolCall && input.chatHistory
    const scope = { userId: input.userId, conversationId: input.conversationId }
    const memoryWrite = model.toolCall && input.memory === 'write'
    const query = textOf(input.path.findLast((m) => m.role === 'user')?.parts ?? [])
    const embedQuery = queryEmbedding(query)
    const firstTurn = input.path.filter((m) => m.role === 'user').length === 1
    const [selection, pastChats] = await Promise.all([
      input.memory === 'off' ? undefined : loadMemories(input.userId, embedQuery),
      input.chatHistory ? loadPastChats(input.userId, input.conversationId, { firstTurn, query, embedQuery }) : undefined,
    ])
    const shown = selection ? [...selection.core, ...selection.relevant] : []
    const label = memoryLabels(shown)
    const memory = {
      ...(chatHistory && createChatHistoryTools(scope)),
      ...(memoryWrite && createMemoryTools(scope)),
    }
    const instructions = chatInstructions(model, {
      chatHistory, memoryWrite, pastChats,
      memories: selection && { rows: selection.core, partial: selection.partial, label },
    })
    const stream = await getChatAgent().stream(withContext(messages, relevantMemoriesPrompt(selection?.relevant ?? [], label)) as never, {
      requestContext: chatContext({ model: resolved.model, instructions }),
      providerOptions: resolved.providerOptions as never,
      toolsets: { builtin: resolved.tools, memory, mcp: model.toolCall ? mcp.tools : {} },
      // The browser supplies the answer; the existing message store preserves it across restarts.
      clientTools: model.toolCall ? { ask_user: askUserTool } : {},
      maxSteps: MAX_STEPS,
      toolCallConcurrency: TOOL_CALL_CONCURRENCY,
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

    const webCalls = new Set<string>()
    const sourceUrls = new Set<string>()
    for await (const chunk of uiStream) {
      // Errors are reported once, after persistence, below.
      if (chunk.type === 'error') {
        failure = new Error(chunk.errorText)
        continue
      }
      if (chunk.type === 'start' || chunk.type === 'finish' || chunk.type === 'abort') continue
      forward(chunk)
      if (chunk.type === 'tool-input-available' && (chunk.toolName === 'web_search' || chunk.toolName === 'web_fetch')) webCalls.add(chunk.toolCallId)
      if (chunk.type === 'source-url') sourceUrls.add(chunk.url)
      if (chunk.type === 'tool-output-available' && webCalls.has(chunk.toolCallId)) {
        const result = exaResponseSchema.safeParse(chunk.output)
        if (!result.success) continue
        const sources = [
          ...result.data.results.flatMap((r) => [r, ...(r.subpages ?? [])]),
          ...(result.data.output?.grounding ?? []).flatMap((g) => g.citations),
        ]
        for (const source of sources) {
          if (!/^https?:\/\//i.test(source.url) || sourceUrls.has(source.url)) continue
          sourceUrls.add(source.url)
          forward({ type: 'source-url', sourceId: source.url, url: source.url, title: source.title ?? undefined })
        }
      }
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

  const reason = stopReason(generation)
  if (reason) {
    metadata.aborted = true
    // A stop the user asked for (or a restart) isn't a failure; running out of time is.
    if (reason === 'user' || reason === 'shutdown' || reason === 'discard') failure = undefined
    else failure ??= new Error('Generation timed out')
  }

  const message = await finalMessage.catch(() => undefined)
  const parts = (message?.parts ?? []).filter((p) => p.type !== 'step-start') as FlaiPart[]

  try {
    if (reason === 'discard') {
      emit({ type: 'finish', finishReason: 'stop', messageMetadata: metadata })
      return
    }
    if (parts.length === 0) {
      if (reason === 'user') {
        emit({ type: 'finish', finishReason: 'stop', messageMetadata: metadata })
        return
      }
      if (reason === 'shutdown') throw new AppError('UNAVAILABLE', 'The server restarted before the reply began. Please retry.')
      throw failure ?? new Error('The model returned an empty response')
    }
    await db.transaction(async (tx) => {
      await tx.insert(schema.messages).values({
        id: input.assistantId,
        conversationId: input.conversationId,
        parentId: parentMessage.id,
        role: 'assistant',
        parts,
        metadata,
        searchText: textOf(parts),
      })
      await touchConversation(input.conversationId, tx)
    })
    nudgeEmbeddingIndexer()
    if (failure) throw failure
    emit({ type: 'message-metadata', messageMetadata: metadata })
    emit({ type: 'finish', finishReason: 'stop', messageMetadata: metadata })
  } catch (error) {
    if (reason !== 'shutdown') {
      console.error('generation failed', error)
      alertLlmError({ operation: 'chat', providerName: provider.name, modelId: model.id, apiKey: provider.apiKey }, error)
    }
    // No `finish` chunk: clients treat a stream without one as failed and reload from the server.
    emit({ type: 'error', errorText: userFacingError(error, provider.apiKey) })
  } finally {
    await bus.close(input.assistantId).catch((error: Error) => console.warn('failed to close reply stream', error.message))
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
  return message || 'Generation failed. Please retry.'
}
