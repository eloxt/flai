import {
  MAX_MEMORY_POINTS,
  MAX_MEMORY_TOPICS,
  MEMORY_KINDS,
  type MemoryContent,
  type MemoryEvent,
  type MemoryEventSource,
} from '@flai/shared'
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

/** A memory's content in a fixed key order, so equal content always serializes the same. */
export const contentOf = ({ kind, title, summary, points }: MemoryContent): MemoryContent => ({ kind, title, summary, points })
const snapshot = (content: MemoryContent) => JSON.stringify(contentOf(content))
export const parseSnapshot = (text: string | null): MemoryContent | null => (text ? (JSON.parse(text) as MemoryContent) : null)

/** Compare text ignoring case, spacing and punctuation, so small rewordings of the same point match. */
export const normalize = (text: string) => text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')

/** `points` followed by those of `added` it doesn't already have. */
export function mergePoints(points: string[], added: string[]): string[] {
  const seen = new Set(points.map(normalize))
  const merged = [...points]
  for (const point of added) {
    const key = normalize(point)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(point)
  }
  return merged
}

function checkPoints(points: string[]) {
  if (points.length > MAX_MEMORY_POINTS) {
    throw new AppError('CONFLICT', `A memory holds at most ${MAX_MEMORY_POINTS} points; edit or split it first`)
  }
}

async function logEvent(
  tx: Db | Tx,
  userId: string,
  memoryId: string,
  action: MemoryEvent['action'],
  before: MemoryContent | null,
  after: MemoryContent | null,
  { source, conversationId = null, note = null }: WriteOptions,
) {
  if (!source) return
  await tx.insert(e).values({
    id: newId(), userId, memoryId, action, source,
    before: before && snapshot(before), after: after && snapshot(after), conversationId, note,
  })
}

const kindOrder = (row: MemoryRow) => MEMORY_KINDS.indexOf(row.kind)

/** Profile first, then topics, then projects; oldest first within each, so the prompt mostly grows at the end. */
export async function listMemories(userId: string): Promise<MemoryRow[]> {
  const rows = await db.select().from(m).where(eq(m.userId, userId)).orderBy(asc(m.createdAt), asc(m.id))
  return rows.sort((a, b) => kindOrder(a) - kindOrder(b))
}

const sameTitle = (a: string, b: string) => normalize(a) === normalize(b)

/**
 * Start a topic. One with the same title takes the new points instead (and the summary, when
 * given), so restating a topic never makes a second one.
 */
export async function createMemory(userId: string, content: MemoryContent, options: WriteOptions = {}): Promise<MemoryRow> {
  const { tx: outer = db } = options
  return outer.transaction(async (tx) => {
    // Lock the user row so concurrent saves can't both slip under the cap or both start a topic.
    await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).for('update')
    const existing = (await tx.select().from(m).where(eq(m.userId, userId))).find((row) => sameTitle(row.title, content.title))
    if (existing) {
      const patch = { points: mergePoints(existing.points, content.points), ...(content.summary && { summary: content.summary }) }
      return (await updateMemory(userId, existing.id, patch, { ...options, tx }))!
    }
    const [counted] = await tx.select({ total: count() }).from(m).where(eq(m.userId, userId))
    if (counted!.total >= MAX_MEMORY_TOPICS) {
      throw new AppError('CONFLICT', `Memory is full (${MAX_MEMORY_TOPICS} topics); merge or delete one first`)
    }
    const points = mergePoints([], content.points)
    checkPoints(points)
    const [row] = await tx.insert(m).values({ id: newId(), userId, ...contentOf({ ...content, points }) }).returning()
    await logEvent(tx, userId, row!.id, 'add', null, contentOf(row!), options)
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

export async function getMemory(userId: string, id: string): Promise<MemoryRow | undefined> {
  return db.query.userMemories.findFirst({ where: and(eq(m.id, id), eq(m.userId, userId)) })
}

export async function updateMemory(
  userId: string,
  id: string,
  patch: Partial<MemoryContent>,
  options: WriteOptions = {},
): Promise<MemoryRow | undefined> {
  const { tx: outer = db } = options
  return outer.transaction(async (tx) => {
    const [current] = await tx.select().from(m).where(and(eq(m.id, id), eq(m.userId, userId))).for('update')
    if (!current) return undefined
    const next = contentOf({ ...contentOf(current), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) })
    if (snapshot(next) === snapshot(current)) return current
    checkPoints(next.points)
    const [row] = await tx.update(m).set(next).where(eq(m.id, id)).returning()
    await logEvent(tx, userId, id, 'update', contentOf(current), next, options)
    return row
  })
}

export async function deleteMemory(userId: string, id: string, options: WriteOptions = {}): Promise<boolean> {
  const { tx = db } = options
  const [row] = await tx.delete(m).where(and(eq(m.id, id), eq(m.userId, userId))).returning()
  if (!row) return false
  if (options.source) await logEvent(tx, userId, id, 'delete', contentOf(row), null, options)
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
  const rows = await tx.select().from(m).where(and(eq(m.userId, userId), inArray(m.id, ids)))
  for (const r of rows) current.set(r.id, snapshot(r))
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

/** Revert one automatic change: remove an added topic, restore an edited or deleted one. */
export async function undoMemoryEvent(userId: string, eventId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [event] = await tx.select().from(e).where(and(eq(e.id, eventId), eq(e.userId, userId))).for('update')
    if (!event) throw notFound('Change')
    const { latest, current } = await undoState(tx, userId, [event.memoryId])
    if (!canUndo(event, latest, current)) throw new AppError('CONFLICT', 'This memory has changed since; edit it directly instead')
    const before = parseSnapshot(event.before)
    if (event.action === 'add') await tx.delete(m).where(eq(m.id, event.memoryId))
    else if (event.action === 'update') await tx.update(m).set(before!).where(eq(m.id, event.memoryId))
    else await tx.insert(m).values({ id: event.memoryId, userId, ...before! })
    await tx.update(e).set({ undoneAt: new Date() }).where(eq(e.id, event.id))
  })
}
