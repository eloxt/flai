import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from './index'

await migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? new URL('../../drizzle', import.meta.url).pathname })
await pool.end()
console.log('migrations applied')
