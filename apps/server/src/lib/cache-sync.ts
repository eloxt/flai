import { randomUUID } from 'node:crypto'
import { Redis } from 'ioredis'
import { config } from '../config'

/**
 * Keeps in-process caches of database state (settings, providers) in step across instances.
 * After a write, the writing instance reloads its own cache and announces the change; every
 * other instance reloads from the database. Without Redis there is one instance and the
 * announcement goes nowhere.
 */
export interface CacheSync {
  /** Register how to reload one cache from the database. */
  register(name: string, load: () => Promise<void>): void
  /** Tell the other instances that `name` changed. */
  changed(name: string): Promise<void>
  /** Listen for changes; resolves once subscribed. */
  start(): Promise<void>
  stop(): Promise<void>
}

class RedisCacheSync implements CacheSync {
  private readonly loaders = new Map<string, () => Promise<void>>()
  /** Lets an instance ignore its own announcements. */
  private readonly origin = randomUUID()
  private readonly channel: string
  private publisher: Redis | undefined
  private subscriber: Redis | undefined

  constructor(
    private readonly url: string,
    prefix: string,
  ) {
    this.channel = `${prefix}cache:changed`
  }

  register(name: string, load: () => Promise<void>) {
    this.loaders.set(name, load)
  }

  async changed(name: string) {
    this.publisher ??= this.connect('redis cache publisher')
    // The write already happened; a lost announcement only delays others until they reconnect.
    await this.publisher.publish(this.channel, `${this.origin}|${name}`).catch((error: Error) => {
      console.warn('failed to announce cache change', name, error.message)
    })
  }

  async start() {
    if (this.subscriber) return
    const subscriber = this.connect('redis cache subscriber')
    this.subscriber = subscriber
    subscriber.on('message', (_channel: string, message: string) => {
      const [origin, name] = message.split('|')
      if (origin !== this.origin && name) void this.reload(name)
    })
    let connected = false
    subscriber.on('ready', () => {
      // Announcements sent while disconnected are lost, so catch up on everything.
      if (connected) for (const name of this.loaders.keys()) void this.reload(name)
      connected = true
    })
    await subscriber.subscribe(this.channel)
  }

  async stop() {
    await Promise.allSettled([this.subscriber?.quit(), this.publisher?.quit()])
    this.subscriber = this.publisher = undefined
  }

  private connect(label: string) {
    const client = new Redis(this.url, { maxRetriesPerRequest: 3 })
    client.on('error', (error) => console.warn(`${label} error`, error.message))
    return client
  }

  private async reload(name: string) {
    await this.loaders.get(name)?.().catch((error: Error) => console.warn('failed to reload cache', name, error.message))
  }
}

class LocalCacheSync implements CacheSync {
  register() {}
  async changed() {}
  async start() {}
  async stop() {}
}

let instance: CacheSync | undefined

export function cacheSync(): CacheSync {
  if (!instance) {
    const { REDIS_URL, REDIS_PREFIX } = config()
    instance = REDIS_URL ? new RedisCacheSync(REDIS_URL, REDIS_PREFIX) : new LocalCacheSync()
  }
  return instance
}

/** For tests: build one directly. */
export function createCacheSync(options: { redisUrl?: string; prefix?: string } = {}): CacheSync {
  return options.redisUrl ? new RedisCacheSync(options.redisUrl, options.prefix ?? 'flai:') : new LocalCacheSync()
}
