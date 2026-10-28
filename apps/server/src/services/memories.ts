import { MAX_MEMORIES, MAX_PINNED_MEMORIES, type MemoryEvent, type MemoryEventSource } from '@flai/shared'
import { and, asc, count, desc, eq, gt, inArray, isNull, like, lt } from 'drizzle-orm'
import { db, type Db, schema, type Tx } from '../db'
import { AppError, notFound } from '../lib/errors'
import { newId } from '../lib/ids'

const m = schema.userMemories
const e = schema.memoryEvents

export type MemoryRow = typeof m.$inferSelect

/** How long automatic changes stay listed for review and undo. */
const EVENT_DAYS = 30
const since = () => new Date(Date.now() - EVENT_DAYS * 86_400_000)

/** A write the assistant makes on the user's behalf is logged; the user's own edits are not. */
export interface WriteOptions {
  tx?: Db | Tx
  source?: MemoryEventSource
  conversationId?: string | null
  note?: string | null
}

async function logEvent(
  tx: Db | Tx,
  userId: string,
  memoryId: string,
  action: MemoryEvent['action'],
  before: string | null,
  after: string | null,
  { source, conversationId = null, note = null }: WriteOptions,
) {
  if (!source) return
  await tx.insert(e).values({ id: newId(), userId, memoryId, action, source, before, after, conversationId, note })
}

async function pinnedCount(tx: Db | Tx, userId: string): Promise<number> {
  const [counted] = await tx.select({ total: count() }).from(m).where(and(eq(m.userId, userId), eq(m.pinned, true)))
  return counted!.total
}

/** Oldest first, so the prompt block only changes at the end as memories are added. */
export function listMemories(userId: string): Promise<MemoryRow[]> {
  return db.select().from(m).where(eq(m.userId, userId)).orderBy(asc(m.createdAt), asc(m.id))
}

/** Save a memory; when the pinned limit is reached it is saved unpinned (check `pinned` on the result). */
export async function createMemory(
  userId: string,
  content: string,
  { pinned = false, ...options }: WriteOptions & { pinned?: boolean } = {},
): Promise<MemoryRow> {
  const { tx: outer = db, conversationId = null } = options
  return outer.transaction(async (tx) => {
    // Lock the user row so concurrent saves can't both slip under the cap.
    await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).for('update')
    const existing = await tx.query.userMemories.findFirst({ where: and(eq(m.userId, userId), eq(m.content, content)) })
    if (existing) return existing
    const [counted] = await tx.select({ total: count() }).from(m).where(eq(m.userId, userId))
    if (counted!.total >= MAX_MEMORIES) {
      throw new AppError('CONFLICT', `Memory is full (${MAX_MEMORIES} items); update or delete one first`)
    }
    if (pinned && (await pinnedCount(tx, userId)) >= MAX_PINNED_MEMORIES) pinned = false
    const [row] = await tx.insert(m).values({ id: newId(), userId, content, pinned, sourceConversationId: conversationId }).returning()
    await logEvent(tx, userId, row!.id, 'add', null, content, options)
    return row!
  })
}

/** Ids of the user's memories starting with `prefix`, at most two: enough to tell a match from an ambiguous one. */
export async function findMemoryIds(userId: string, prefix: string): Promise<string[]> {
  // Ids are UUIDs, so anything else (including LIKE wildcards) can't match.
  if (!/^[0-9a-f-]+$/i.test(prefix)) return []
  const rows = await db.select({ id: m.id }).from(m)
    .where(and(eq(m.userId, userId), like(m.id, `${prefix.toLowerCase()}%`)))
    .limit(2)
  return rows.map((r) => r.id)
}

export async function updateMemory(
  userId: string,
  id: string,
  patch: { content?: string; pinned?: boolean },
  options: WriteOptions = {},
): Promise<MemoryRow | undefined> {
  const { tx: outer = db } = options
  return outer.transaction(async (tx) => {
    const current = await tx.query.userMemories.findFirst({ where: and(eq(m.id, id), eq(m.userId, userId)) })
    if (!current) return undefined
    if (patch.pinned && !current.pinned && (await pinnedCount(tx, userId)) >= MAX_PINNED_MEMORIES) {
      throw new AppError('CONFLICT', `At most ${MAX_PINNED_MEMORIES} memories can be pinned`)
    }
    const [row] = await tx.update(m).set(patch).where(eq(m.id, id)).returning()
    if (patch.content !== undefined && patch.content !== current.content) {
      await logEvent(tx, userId, id, 'update', current.content, patch.content, options)
    }
    return row
  })
}

export async function deleteMemory(userId: string, id: string, options: WriteOptions = {}): Promise<boolean> {
  const { tx = db } = options
  const [row] = await tx.delete(m).where(and(eq(m.id, id), eq(m.userId, userId))).returning({ content: m.content })
  if (!row) return false
  if (options.source) await logEvent(tx, userId, id, 'delete', row.content, null, options)
  // The user deleting it means forgetting it, history included.
  else await tx.delete(e).where(and(eq(e.userId, userId), eq(e.memoryId, id)))
  return true
}

/** Forget automatic changes once they are past review. */
export async function pruneMemoryEvents(): Promise<void> {
  await db.delete(e).where(lt(e.createdAt, since()))
}

export async function clearMemories(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(m).where(eq(m.userId, userId))
    await tx.delete(e).where(eq(e.userId, userId))
  })
}

export type MemoryEventRow = typeof e.$inferSelect

/** Whether undoing `event` still leaves the memory as it was before it, given its current state. */
function canUndo(event: MemoryEventRow, latest: Map<string, string>, current: Map<string, string>): boolean {
  if (event.undoneAt || latest.get(event.memoryId) !== event.id) return false
  if (event.action === 'delete') return !current.has(event.memoryId)
  return current.get(event.memoryId) === event.after
}

/** The latest live event and current content of each memory. */
async function undoState(tx: Db | Tx, userId: string, memoryIds: string[]) {
  const ids = [...new Set(memoryIds)]
  const latest = new Map<string, string>()
  const current = new Map<string, string>()
  if (ids.length === 0) return { latest, current }
  const live = await tx.select({ id: e.id, memoryId: e.memoryId }).from(e)
    .where(and(eq(e.userId, userId), inArray(e.memoryId, ids), isNull(e.undoneAt)))
    .orderBy(desc(e.createdAt), desc(e.id))
  for (const ev of live) if (!latest.has(ev.memoryId)) latest.set(ev.memoryId, ev.id)
  const rows = await tx.select({ id: m.id, content: m.content }).from(m).where(and(eq(m.userId, userId), inArray(m.id, ids)))
  for (const r of rows) current.set(r.id, r.content)
  return { latest, current }
}

/** The assistant's recent changes to the user's memories, newest first. */
export async function listMemoryEvents(userId: string): Promise<(MemoryEventRow & { undoable: boolean })[]> {
  const events = await db.select().from(e)
    .where(and(eq(e.userId, userId), gt(e.createdAt, since())))
    .orderBy(desc(e.createdAt), desc(e.id))
    .limit(100)
  const { latest, current } = await undoState(db, userId, events.map((ev) => ev.memoryId))
  return events.map((ev) => ({ ...ev, undoable: canUndo(ev, latest, current) }))
}

/** Revert one automatic change: remove an added memory, restore an edited or deleted one. */
export async function undoMemoryEvent(userId: string, eventId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [event] = await tx.select().from(e).where(and(eq(e.id, eventId), eq(e.userId, userId))).for('update')
    if (!event) throw notFound('Change')
    const { latest, current } = await undoState(tx, userId, [event.memoryId])
    if (!canUndo(event, latest, current)) throw new AppError('CONFLICT', 'This memory has changed since; edit it directly instead')
    if (event.action === 'add') await tx.delete(m).where(eq(m.id, event.memoryId))
    else if (event.action === 'update') await tx.update(m).set({ content: event.before! }).where(eq(m.id, event.memoryId))
    else await tx.insert(m).values({ id: event.memoryId, userId, content: event.before!, sourceConversationId: event.conversationId })
    await tx.update(e).set({ undoneAt: new Date() }).where(eq(e.id, event.id))
  })
}
