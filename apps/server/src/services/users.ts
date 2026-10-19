import { and, isNull, ne, sql } from 'drizzle-orm'
import { db, schema } from '../db'

const u = schema.users

/** A live user with this (already normalised) email, matching the unique index on `lower(btrim(email))`. */
export function findUserByEmail(email: string, { exceptId }: { exceptId?: string } = {}) {
  return db.query.users.findFirst({
    where: and(sql`lower(btrim(${u.email})) = ${email}`, isNull(u.deletedAt), exceptId ? ne(u.id, exceptId) : undefined),
  })
}
