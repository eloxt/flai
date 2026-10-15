import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { db, schema } from '../db'
import { tokenMatchesUser, verifyToken } from '../lib/auth'
import { AppError } from '../lib/errors'
import type { AppEnv } from '../lib/hono'

/**
 * Validates the bearer access token and reloads the user on every request, so
 * deactivation, deletion and password changes take effect immediately.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new AppError('UNAUTHORIZED', 'Missing access token')

  const claims = await verifyToken(token, 'access')
  if (!claims) throw new AppError('UNAUTHORIZED', 'Invalid or expired token')

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, claims.sub) })
  if (!tokenMatchesUser(claims, user)) throw new AppError('UNAUTHORIZED', 'Session is no longer valid')

  c.set('user', user!)
  await next()
})

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'admin') throw new AppError('FORBIDDEN', 'Administrator access required')
  await next()
})
