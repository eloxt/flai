import { loginSchema, refreshSchema, registerSchema } from '@flai/shared'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, schema } from '../db'
import { hashPassword, issueTokens, tokenMatchesUser, verifyPassword, verifyToken } from '../lib/auth'
import { isUniqueViolation } from '../lib/db-errors'
import { AppError } from '../lib/errors'
import { body } from '../lib/hono'
import { newId } from '../lib/ids'
import { toUser } from '../lib/serialize'

const findByEmail = (email: string) =>
  db.query.users.findFirst({
    where: and(sql`lower(btrim(${schema.users.email})) = ${email}`, isNull(schema.users.deletedAt)),
  })

export const authRoutes = new Hono()
  .post('/register', async (c) => {
    const input = await body(c, registerSchema)
    if (await findByEmail(input.email)) throw new AppError('CONFLICT', 'Email is already registered')
    try {
      // New accounts wait for an administrator to activate them.
      const [user] = await db
        .insert(schema.users)
        .values({
          id: newId(),
          email: input.email,
          username: input.username,
          passwordHash: await hashPassword(input.password),
          isActive: false,
        })
        .returning()
      return c.json({ user: toUser(user!) }, 201)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError('CONFLICT', 'Email is already registered')
      throw error
    }
  })
  .post('/login', async (c) => {
    const input = await body(c, loginSchema)
    const user = await findByEmail(input.email)
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new AppError('UNAUTHORIZED', 'Incorrect email or password')
    }
    if (!user.isActive) throw new AppError('USER_INACTIVE', 'Account is waiting for activation')
    return c.json({ user: toUser(user), tokens: await issueTokens(user) })
  })
  .post('/refresh', async (c) => {
    const input = await body(c, refreshSchema)
    const claims = await verifyToken(input.refreshToken, 'refresh')
    const user = claims ? await db.query.users.findFirst({ where: eq(schema.users.id, claims.sub) }) : undefined
    if (!claims || !tokenMatchesUser(claims, user)) throw new AppError('UNAUTHORIZED', 'Session expired, please log in again')
    return c.json({ user: toUser(user!), tokens: await issueTokens(user!) })
  })
