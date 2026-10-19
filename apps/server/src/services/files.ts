import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '../db'
import { badRequest } from '../lib/errors'

/** Load files by id, ensuring they all belong to `userId`. */
export async function ownedFiles(userId: string, ids: string[]) {
  if (ids.length === 0) return []
  const rows = await db
    .select()
    .from(schema.files)
    .where(and(inArray(schema.files.id, ids), eq(schema.files.userId, userId)))
  if (rows.length !== new Set(ids).size) throw badRequest('One or more files were not found')
  return ids.map((id) => rows.find((r) => r.id === id)!)
}
