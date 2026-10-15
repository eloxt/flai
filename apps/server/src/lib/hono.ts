import type { Context } from 'hono'
import type { z } from 'zod'
import type { schema } from '../db'
import { AppError } from './errors'

export type UserRow = typeof schema.users.$inferSelect

export interface AppEnv {
  Variables: {
    user: UserRow
    requestId: string
  }
}

export type AppContext = Context<AppEnv>

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new AppError('VALIDATION', result.error.issues[0]?.message ?? 'Invalid request', result.error.issues)
  }
  return result.data
}

export async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  let json: unknown
  try {
    json = await c.req.json()
  } catch {
    throw new AppError('BAD_REQUEST', 'Request body must be JSON')
  }
  return parse(schema, json)
}

export function query<T extends z.ZodType>(c: Context, schema: T): z.output<T> {
  return parse(schema, c.req.query())
}
