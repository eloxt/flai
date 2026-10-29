import { serve } from '@hono/node-server'
import { createApp } from './app'
import { config } from './config'
import { pool } from './db'
import { cacheSync } from './lib/cache-sync'
import { startEmbeddingIndexer, stopEmbeddingIndexer } from './llm/embedding-index'
import { shutdownGenerations } from './llm/generation'
import { startMemoryExtraction, stopMemoryExtraction } from './llm/memory-extraction'
import { reloadProviders } from './services/providers'
import { loadSettings } from './services/settings'

const sync = cacheSync()
sync.register('settings', loadSettings)
sync.register('providers', reloadProviders)
// Listen first, so a change made by another instance while loading isn't missed.
await sync.start()
await Promise.all([loadSettings(), reloadProviders()])
startEmbeddingIndexer()
startMemoryExtraction()

const server = serve({ fetch: createApp().fetch, port: config().PORT }, (info) => {
  console.log(`flai server listening on http://localhost:${info.port}`)
})

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    server.close()
    stopEmbeddingIndexer()
    stopMemoryExtraction()
    // Save in-flight replies before the database goes away; clients resume them after restart.
    void shutdownGenerations()
      .catch((error) => console.error('failed to stop generations', error))
      .then(() => Promise.all([sync.stop(), pool.end()]))
      .finally(() => process.exit(0))
  })
}
