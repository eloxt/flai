import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { config } from '../config'
import * as schema from './schema'

export const pool = new pg.Pool({ connectionString: config().DATABASE_URL, max: 20 })
export const db = drizzle(pool, { schema, casing: 'snake_case' })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export { schema }
