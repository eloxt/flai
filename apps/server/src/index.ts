import { serve } from '@hono/node-server'
import { createApp } from './app'
import { config } from './config'
import { pool } from './db'
import { reloadProviders } from './services/providers'
import { loadSettings } from './services/settings'

await Promise.all([loadSettings(), reloadProviders()])

const server = serve({ fetch: createApp().fetch, port: config().PORT }, (info) => {
  console.log(`flai server listening on http://localhost:${info.port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close()
    void pool.end().finally(() => process.exit(0))
  })
}
