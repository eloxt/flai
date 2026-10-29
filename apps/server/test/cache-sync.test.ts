/**
 * The Redis case needs a server:
 *   FLAI_TEST_REDIS_URL=redis://127.0.0.1:56379 pnpm test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type CacheSync, createCacheSync } from '../src/lib/cache-sync'

const REDIS_URL = process.env.FLAI_TEST_REDIS_URL
const started: CacheSync[] = []

afterEach(async () => {
  await Promise.all(started.splice(0).map((sync) => sync.stop()))
})

async function instance(prefix: string) {
  const sync = createCacheSync({ redisUrl: REDIS_URL, prefix })
  const load = vi.fn().mockResolvedValue(undefined)
  sync.register('settings', load)
  await sync.start()
  started.push(sync)
  return { sync, load }
}

describe.skipIf(!REDIS_URL)('redis cache sync', () => {
  it('reloads the cache on other instances, not the one that announced', async () => {
    const prefix = `flai-test-${Date.now()}:`
    const a = await instance(prefix)
    const b = await instance(prefix)
    await a.sync.changed('settings')
    await vi.waitFor(() => expect(b.load).toHaveBeenCalledOnce())
    await a.sync.changed('providers')
    await new Promise((r) => setTimeout(r, 50))
    expect(a.load).not.toHaveBeenCalled()
    expect(b.load).toHaveBeenCalledOnce()
  })
})

describe('local cache sync', () => {
  it('accepts announcements without Redis', async () => {
    const sync = createCacheSync()
    sync.register('settings', vi.fn())
    await sync.start()
    await expect(sync.changed('settings')).resolves.toBeUndefined()
  })
})
