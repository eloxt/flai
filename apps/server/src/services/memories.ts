import { MAX_MEMORIES } from '@flai/shared'
import { and, asc, count, eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'

const m = schema.userMemories

export type MemoryRow = typeof m.$inferSelect

/** Oldest first, so the prompt block only changes at the end as memories are added. */
export function listMemories(userId: string): Promise<MemoryRow[]> {
  return db.select().from(m).where(eq(m.userId, userId)).orderBy(asc(m.createdAt), asc(m.id))
}

export async function createMemory(userId: string, content: string, sourceConversationId: string | null = null): Promise<MemoryRow> {
  return db.transaction(async (tx) => {
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

export async function updateMemory(userId: string, id: string, content: string): Promise<MemoryRow | undefined> {
  const [row] = await db.update(m).set({ content }).where(and(eq(m.id, id), eq(m.userId, userId))).returning()
  return row
}

export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(m).where(and(eq(m.id, id), eq(m.userId, userId))).returning({ id: m.id })
  return rows.length > 0
}

export async function clearMemories(userId: string): Promise<void> {
  await db.delete(m).where(eq(m.userId, userId))
}
