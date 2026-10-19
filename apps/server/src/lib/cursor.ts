import { and, type Column, eq, lt, or, type SQL } from 'drizzle-orm'
import { AppError } from './errors'

/** Opaque keyset cursor over (timestamp, id), newest first. */
export interface Cursor {
  at: Date
  id: string
}

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id])).toString('base64url')
}

export function decodeCursor(raw: string | undefined): Cursor | undefined {
  if (!raw) return undefined
  try {
    const [at, id] = JSON.parse(Buffer.from(raw, 'base64url').toString()) as [string, string]
    const date = new Date(at)
    if (Number.isNaN(date.getTime()) || typeof id !== 'string') throw new Error('bad cursor')
    return { at: date, id }
  } catch {
    throw new AppError('BAD_REQUEST', 'Invalid cursor')
  }
}

/** Rows strictly after `cursor` in (`at` desc, `id` desc) order; no condition without a cursor. */
export function afterCursor(at: Column, id: Column, cursor: Cursor | undefined): SQL | undefined {
  return cursor ? or(lt(at, cursor.at), and(eq(at, cursor.at), lt(id, cursor.id))) : undefined
}

/** Fetch `limit + 1` rows, then call this to split off the next cursor. */
export function paginate<T>(rows: T[], limit: number, key: (row: T) => [Date, string]) {
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(...key(last)) : null,
  }
}
