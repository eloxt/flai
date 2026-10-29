import { type SQL, sql } from 'drizzle-orm'

/** A Postgres interval of `ms` milliseconds, for leases and age checks. */
export const msInterval = (ms: number): SQL => sql`${`${ms} milliseconds`}::interval`

/**
 * Process claimed items one by one. A failure is logged and `release` holds the item back for a
 * while (rather than letting the lease lapse into an immediate retry); the rest still run.
 */
export async function processClaims<T>(
  label: string,
  claims: T[],
  { id, process, release }: { id: (claim: T) => string; process: (claim: T) => Promise<unknown>; release: (claim: T) => Promise<unknown> },
): Promise<number> {
  for (const claim of claims) {
    try {
      await process(claim)
    } catch (error) {
      console.warn(`failed to ${label}`, id(claim), error)
      await release(claim).catch(() => {})
    }
  }
  return claims.length
}

export interface BackgroundLoop {
  start(): void
  stop(): void
  /** Run soon, unless a pass is already running; a no-op until started. */
  nudge(): void
}

/**
 * Run `pass` one at a time while the server runs: `startMs` after starting or a nudge, then
 * `idleMs` after each pass (`retryMs` after one that threw). `active` turns false once stopped,
 * so a pass working through a backlog can stop early.
 */
export function backgroundLoop(
  label: string,
  { startMs, idleMs, retryMs = idleMs, pass }: {
    startMs: number
    idleMs: number
    retryMs?: number
    pass: (active: () => boolean) => Promise<void>
  },
): BackgroundLoop {
  let timer: NodeJS.Timeout | undefined
  let running: Promise<void> | undefined
  let started = false

  const schedule = (ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => void run(), ms).unref()
  }

  const run = async () => {
    if (running) return running
    running = (async () => {
      let delay = idleMs
      try {
        await pass(() => started)
      } catch (error) {
        console.warn(`${label} failed`, error)
        delay = retryMs
      } finally {
        running = undefined
        if (started) schedule(delay)
      }
    })()
    return running
  }

  return {
    start() {
      started = true
      schedule(startMs)
    },
    stop() {
      started = false
      clearTimeout(timer)
    },
    nudge() {
      if (started && !running) schedule(startMs)
    },
  }
}
