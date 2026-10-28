import { and, isNull, sql } from 'drizzle-orm'
import { db, schema } from '../db'
import { isUniqueViolation } from '../lib/db-errors'
import { AppError } from '../lib/errors'

const u = schema.users

/** A live user with this (already normalised) email, matching the unique index on `lower(btrim(email))`. */
export function findUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: and(sql`lower(btrim(${u.email})) = ${email}`, isNull(u.deletedAt)),
  })
}

/** Run a write that sets a user's email; the unique index decides whether the email is taken. */
export async function withUniqueEmail<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError('CONFLICT', 'Email is already registered')
    throw error
  }
}
