import { ApiError, apiFetch } from "~/lib/api"
import { type Chunk, parseStreamEvents } from "~/lib/ui-stream"

/** Waits between reconnect attempts; the stream gives up after the last one. */
const RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 8_000]

const isTerminal = (chunk: Chunk) => chunk.type === "finish" || chunk.type === "error" || chunk.type === "abort"

/** Thrown when the reply could not be followed to its end. */
export class ReplyStreamInterrupted extends Error {
  constructor() {
    super("Reply stream interrupted")
    this.name = "ReplyStreamInterrupted"
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      window.removeEventListener("online", done)
      signal.removeEventListener("abort", done)
      resolve()
    }
    // Coming back online is worth an immediate retry.
    const timer = setTimeout(done, ms)
    window.addEventListener("online", done, { once: true })
    signal.addEventListener("abort", done, { once: true })
  })
}

/**
 * The chunks of one assistant reply as a single stream that survives dropped connections.
 * `open` starts it (e.g. by sending a message); without it, this joins a reply already in
 * progress from its first chunk. When a response ends before the reply does, it reconnects
 * from the last event id so nothing is missed or repeated, and the reader never notices.
 *
 * The stream closes after the reply's last chunk. It also closes early if the server no
 * longer knows the reply (it finished long ago or never started): callers should then
 * reload from the server. It errors if every reconnect attempt fails.
 */
export function replyStream(
  assistantId: string,
  signal: AbortSignal,
  open?: (signal: AbortSignal) => Promise<Response>
): ReadableStream<Chunk> {
  return new ReadableStream<Chunk>({
    async start(controller) {
      let lastId = "0"
      let attempt = 0
      const resume = (s: AbortSignal) => apiFetch(`/generations/${assistantId}/stream`, { query: { after: lastId }, signal: s })
      let connect = open ?? resume
      while (!signal.aborted) {
        let ended = false
        try {
          const res = await connect(signal)
          if (!res.body) throw new ReplyStreamInterrupted()
          const reader = parseStreamEvents(res.body).getReader()
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              if (value.id) lastId = value.id
              attempt = 0
              controller.enqueue(value.chunk)
              if (isTerminal(value.chunk)) ended = true
            }
          } finally {
            reader.releaseLock()
          }
        } catch (error) {
          if (signal.aborted) break
          // A restarting server (5xx behind a proxy) is retried like a dropped connection.
          const retryable = connect === resume && error instanceof ApiError && error.status >= 500
          if (error instanceof ApiError && error.code !== "NETWORK" && !retryable) {
            // Unknown reply: there is nothing to resume.
            if (error.status === 404 && connect === resume) break
            controller.error(error)
            return
          }
        }
        if (ended || signal.aborted) break
        if (attempt >= RETRY_DELAYS_MS.length) {
          controller.error(new ReplyStreamInterrupted())
          return
        }
        await wait(RETRY_DELAYS_MS[attempt++]!, signal)
        connect = resume
      }
      controller.close()
    },
  })
}
