import { MAX_MEMORIES } from '@flai/shared'
import { and, asc, count, eq, like } from 'drizzle-orm'
import { db, type Db, schema, type Tx } from '../db'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'

const m = schema.userMemories

export type MemoryRow = typeof m.$inferSelect

/** Oldest first, so the prompt block only changes at the end as memories are added. */
export function listMemories(userId: string): Promise<MemoryRow[]> {
  return db.select().from(m).where(eq(m.userId, userId)).orderBy(asc(m.createdAt), asc(m.id))
}

export async function createMemory(
  userId: string,
  content: string,
  sourceConversationId: string | null = null,
  outer: Db | Tx = db,
): Promise<MemoryRow> {
  return outer.transaction(async (tx) => {
    // Lock the user row so concurrent saves can't both slip under the cap.
    await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).for('update')
    const existing = await tx.query.userMemories.findFirst({ where: and(eq(m.userId, userId), eq(m.content, content)) })
    if (existing) return existing
    const [counted] = await tx.select({ total: count() }).from(m).where(eq(m.userId, userId))
    if (counted!.total >= MAX_MEMORIES) {
      throw new AppError('CONFLICT', `Memory is full (${MAX_MEMORIES} items); update or delete one first`)
    }
    const [row] = await tx.insert(m).values({ id: newId(), userId, content, sourceConversationId }).returning()
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

export async function updateMemory(userId: string, id: string, content: string, tx: Db | Tx = db): Promise<MemoryRow | undefined> {
  const [row] = await tx.update(m).set({ content }).where(and(eq(m.id, id), eq(m.userId, userId))).returning()
  return row
}

export async function deleteMemory(userId: string, id: string, tx: Db | Tx = db): Promise<boolean> {
  const rows = await tx.delete(m).where(and(eq(m.id, id), eq(m.userId, userId))).returning({ id: m.id })
  return rows.length > 0
}

export async function clearMemories(userId: string): Promise<void> {
  await db.delete(m).where(eq(m.userId, userId))
}
