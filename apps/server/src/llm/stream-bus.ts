import type { MessageMetadata } from '@flai/shared'
import type { UIMessageChunk } from 'ai'
import { Redis } from 'ioredis'
import { config } from '../config'

export type Chunk = UIMessageChunk<MessageMetadata>

/** One chunk of a reply with its position in the reply's stream (usable as an SSE event id). */
export interface StreamEntry {
  id: string
  chunk: Chunk
}

export interface GenerationInfo {
  assistantId: string
  userId: string
  conversationId: string
  /** The user turn or answered question being continued. */
  parentId: string
  done: boolean
}

/** Why a reply was asked to stop early. `discard` means the conversation went away: don't save. */
export type CancelReason = 'user' | 'discard'

/**
 * Where in-flight replies live. The process generating a reply writes chunks here; any
 * process can replay them from a position, follow them live, look them up, or ask the
 * owner to stop. Redis Streams make this work across restarts and instances; without
 * Redis everything stays in this process.
 */
export interface GenerationBus {
  open(info: Omit<GenerationInfo, 'done'>): Promise<void>
  /** Ordered, fire-and-forget. */
  append(assistantId: string, chunk: Chunk): void
  /** Marks the end of the stream; readers stop after the last chunk. */
  close(assistantId: string): Promise<void>
  /** Keeps a running reply's lease alive; returns a pending cancel request, if any. */
  heartbeat(assistantId: string): Promise<CancelReason | null>
  info(assistantId: string): Promise<GenerationInfo | null>
  /** The reply currently being generated in a conversation, if any. */
  active(conversationId: string): Promise<GenerationInfo | null>
  /**
   * Entries after `after` ("0" = from the start), then live ones until the stream closes.
   * If the generating process disappears, yields a final error chunk instead of hanging.
   */
  read(assistantId: string, after: string, signal: AbortSignal): AsyncGenerator<StreamEntry>
  requestCancel(assistantId: string, reason: CancelReason): Promise<void>
  /** Called (in the owning process) when any process requests a cancel. Resolves once listening. */
  onCancel(handler: (assistantId: string, reason: CancelReason) => void): Promise<void>
  shutdown(): Promise<void>
}

/** How long a finished reply stays replayable, for clients that reconnect late. */
const RETAIN_MS = 5 * 60_000
/** A running reply whose owner hasn't checked in for this long is considered lost. */
const LEASE_MS = 30_000
export const HEARTBEAT_MS = 10_000
/** Upper bound on how long a reader waits before re-checking that the owner is alive. */
const BLOCK_MS = 5_000

const lostChunk = (): Chunk => ({ type: 'error', errorText: 'The reply was interrupted because the server stopped. Please retry.' })

const isCancelReason = (value: unknown): value is CancelReason => value === 'user' || value === 'discard'

// ---------------------------------------------------------------- in-memory

interface MemoryGeneration {
  info: GenerationInfo
  entries: StreamEntry[]
  waiters: Set<() => void>
  cancel: CancelReason | null
}

class MemoryBus implements GenerationBus {
  private readonly generations = new Map<string, MemoryGeneration>()
  private readonly activeByConversation = new Map<string, string>()
  private cancelHandler: ((assistantId: string, reason: CancelReason) => void) | undefined

  async open(info: Omit<GenerationInfo, 'done'>) {
    this.generations.set(info.assistantId, { info: { ...info, done: false }, entries: [], waiters: new Set(), cancel: null })
    this.activeByConversation.set(info.conversationId, info.assistantId)
  }

  append(assistantId: string, chunk: Chunk) {
    const generation = this.generations.get(assistantId)
    if (!generation || generation.info.done) return
    generation.entries.push({ id: String(generation.entries.length + 1), chunk })
    this.wake(generation)
  }

  async close(assistantId: string) {
    const generation = this.generations.get(assistantId)
    if (!generation) return
    generation.info.done = true
    this.wake(generation)
    if (this.activeByConversation.get(generation.info.conversationId) === assistantId) {
      this.activeByConversation.delete(generation.info.conversationId)
    }
    setTimeout(() => this.generations.delete(assistantId), RETAIN_MS).unref()
  }

  async heartbeat(assistantId: string) {
    return this.generations.get(assistantId)?.cancel ?? null
  }

  async info(assistantId: string) {
    const generation = this.generations.get(assistantId)
    return generation ? { ...generation.info } : null
  }

  async active(conversationId: string) {
    const id = this.activeByConversation.get(conversationId)
    return id ? this.info(id) : null
  }

  async *read(assistantId: string, after: string, signal: AbortSignal): AsyncGenerator<StreamEntry> {
    const generation = this.generations.get(assistantId)
    if (!generation) return
    // Memory ids are 1-based positions, so "after N" starts at index N.
    let index = Math.max(0, Number.parseInt(after, 10) || 0)
    while (!signal.aborted) {
      while (index < generation.entries.length) yield generation.entries[index++]!
      if (generation.info.done) return
      await new Promise<void>((resolve) => {
        const wake = () => {
          generation.waiters.delete(wake)
          signal.removeEventListener('abort', wake)
          resolve()
        }
        generation.waiters.add(wake)
        signal.addEventListener('abort', wake, { once: true })
      })
    }
  }

  async requestCancel(assistantId: string, reason: CancelReason) {
    const generation = this.generations.get(assistantId)
    if (!generation || generation.info.done) return
    generation.cancel ??= reason
    this.cancelHandler?.(assistantId, reason)
  }

  async onCancel(handler: (assistantId: string, reason: CancelReason) => void) {
    this.cancelHandler = handler
  }

  async shutdown() {}

  private wake(generation: MemoryGeneration) {
    for (const wake of [...generation.waiters]) wake()
  }
}

// ---------------------------------------------------------------- Redis Streams

/** Deletes a key only if it still holds the given value. */
const DELETE_IF_EQUALS = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`

class RedisBus implements GenerationBus {
  private readonly client: Redis
  private subscriber: Redis | undefined
  private subscribed: Promise<void> | undefined
  private cancelHandler: ((assistantId: string, reason: CancelReason) => void) | undefined
  private readonly readers = new Set<Redis>()

  constructor(
    url: string,
    private readonly prefix: string,
  ) {
    this.client = new Redis(url, { enableAutoPipelining: true, maxRetriesPerRequest: 3 })
    this.client.on('error', (error) => console.warn('redis error', error.message))
  }

  private metaKey = (id: string) => `${this.prefix}gen:${id}`
  private streamKey = (id: string) => `${this.prefix}gen:${id}:stream`
  private activeKey = (conversationId: string) => `${this.prefix}conv:${conversationId}:active`
  private get cancelChannel() {
    return `${this.prefix}gen:cancel`
  }

  async open(info: Omit<GenerationInfo, 'done'>) {
    await this.client
      .multi()
      .hset(this.metaKey(info.assistantId), {
        userId: info.userId,
        conversationId: info.conversationId,
        parentId: info.parentId,
        done: '0',
      })
      .pexpire(this.metaKey(info.assistantId), LEASE_MS)
      .set(this.activeKey(info.conversationId), info.assistantId, 'PX', LEASE_MS)
      .exec()
  }

  append(assistantId: string, chunk: Chunk) {
    // Commands on one connection run in order, so chunks land in the order they were produced.
    this.client.xadd(this.streamKey(assistantId), '*', 'c', JSON.stringify(chunk)).catch((error: Error) => {
      console.warn('failed to append reply chunk', error.message)
    })
  }

  async close(assistantId: string) {
    const meta = this.metaKey(assistantId)
    const conversationId = await this.client.hget(meta, 'conversationId')
    const tx = this.client
      .multi()
      .xadd(this.streamKey(assistantId), '*', 'end', '1')
      .hset(meta, 'done', '1')
      .pexpire(meta, RETAIN_MS)
      .pexpire(this.streamKey(assistantId), RETAIN_MS)
    if (conversationId) tx.eval(DELETE_IF_EQUALS, 1, this.activeKey(conversationId), assistantId)
    await tx.exec()
  }

  async heartbeat(assistantId: string) {
    const meta = this.metaKey(assistantId)
    const [conversationId, cancel] = await this.client.hmget(meta, 'conversationId', 'cancel')
    const tx = this.client.multi().pexpire(meta, LEASE_MS).pexpire(this.streamKey(assistantId), LEASE_MS)
    if (conversationId) tx.pexpire(this.activeKey(conversationId), LEASE_MS)
    await tx.exec()
    return isCancelReason(cancel) ? cancel : null
  }

  async info(assistantId: string): Promise<GenerationInfo | null> {
    const meta = await this.client.hgetall(this.metaKey(assistantId))
    if (!meta.userId || !meta.conversationId || !meta.parentId) return null
    return { assistantId, userId: meta.userId, conversationId: meta.conversationId, parentId: meta.parentId, done: meta.done === '1' }
  }

  async active(conversationId: string) {
    const id = await this.client.get(this.activeKey(conversationId))
    const info = id ? await this.info(id) : null
    return info && !info.done ? info : null
  }

  async *read(assistantId: string, after: string, signal: AbortSignal): AsyncGenerator<StreamEntry> {
    if (signal.aborted) return
    // XREAD BLOCK holds its connection, so each reader gets its own; aborting drops it.
    const reader = this.client.duplicate({ enableAutoPipelining: false })
    reader.on('error', () => {})
    this.readers.add(reader)
    const stop = () => reader.disconnect()
    signal.addEventListener('abort', stop, { once: true })
    let cursor = after
    try {
      while (!signal.aborted) {
        const result = await reader.xread('COUNT', 500, 'BLOCK', BLOCK_MS, 'STREAMS', this.streamKey(assistantId), cursor)
        const entries = result?.[0]?.[1] ?? []
        if (entries.length === 0) {
          // Nothing new for a while: make sure someone is still generating.
          if (!(await this.client.exists(this.metaKey(assistantId)))) {
            yield { id: '', chunk: lostChunk() }
            return
          }
          continue
        }
        for (const [id, fields] of entries) {
          cursor = id
          const record = toRecord(fields)
          if (record.end) return
          if (!record.c) continue
          yield { id, chunk: JSON.parse(record.c) as Chunk }
        }
      }
    } catch (error) {
      if (!signal.aborted) throw error
    } finally {
      signal.removeEventListener('abort', stop)
      this.readers.delete(reader)
      reader.disconnect()
    }
  }

  async requestCancel(assistantId: string, reason: CancelReason) {
    // The flag covers an owner that misses the message; it picks it up on its next heartbeat.
    await this.client
      .multi()
      .hset(this.metaKey(assistantId), 'cancel', reason)
      .publish(this.cancelChannel, `${assistantId}|${reason}`)
      .exec()
  }

  onCancel(handler: (assistantId: string, reason: CancelReason) => void) {
    this.cancelHandler = handler
    if (this.subscribed) return this.subscribed
    const subscriber = this.client.duplicate({ enableAutoPipelining: false })
    subscriber.on('error', (error) => console.warn('redis subscriber error', error.message))
    subscriber.on('message', (_channel: string, message: string) => {
      const [id, reason] = message.split('|')
      if (id && isCancelReason(reason)) this.cancelHandler?.(id, reason)
    })
    this.subscriber = subscriber
    this.subscribed = subscriber.subscribe(this.cancelChannel).then(() => undefined)
    return this.subscribed
  }

  async shutdown() {
    for (const reader of this.readers) reader.disconnect()
    await Promise.allSettled([this.subscriber?.quit(), this.client.quit()])
  }
}

function toRecord(fields: string[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (let i = 0; i + 1 < fields.length; i += 2) record[fields[i]!] = fields[i + 1]!
  return record
}

// ---------------------------------------------------------------- selection

let instance: GenerationBus | undefined

export function generationBus(): GenerationBus {
  if (!instance) {
    const { REDIS_URL, REDIS_PREFIX } = config()
    instance = REDIS_URL ? new RedisBus(REDIS_URL, REDIS_PREFIX) : new MemoryBus()
  }
  return instance
}

/** For tests: build a bus directly. */
export function createGenerationBus(options: { redisUrl?: string; prefix?: string } = {}): GenerationBus {
  return options.redisUrl ? new RedisBus(options.redisUrl, options.prefix ?? 'flai:') : new MemoryBus()
}

/** Valid positions are "0", memory positions ("12") and Redis stream ids ("1700000000000-3"). */
export const isStreamPosition = (value: string) => /^\d+(-\d+)?$/.test(value)
