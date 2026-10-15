import { generationBus } from '../llm/stream-bus'

const KEEP_ALIVE_MS = 15_000

const HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
  'x-vercel-ai-ui-message-stream': 'v1',
  'x-accel-buffering': 'no',
}

/**
 * Stream a reply as an AI SDK UI message stream (SSE). Every event carries its bus position
 * as the SSE `id`, so a client that loses the connection can resume with `Last-Event-ID`
 * (or `?after=`) without missing or repeating chunks.
 */
export function replyStreamResponse(assistantId: string, after: string, requestSignal?: AbortSignal): Response {
  const encoder = new TextEncoder()
  const abort = new AbortController()
  requestSignal?.addEventListener('abort', () => abort.abort(), { once: true })
  const entries = generationBus().read(assistantId, after, abort.signal)
  let keepAlive: ReturnType<typeof setInterval> | undefined

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      keepAlive = setInterval(() => controller.enqueue(encoder.encode(': keep-alive\n\n')), KEEP_ALIVE_MS)
    },
    async pull(controller) {
      try {
        const next = await entries.next()
        if (next.done) {
          clearInterval(keepAlive)
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          return
        }
        const { id, chunk } = next.value
        controller.enqueue(encoder.encode(`${id ? `id: ${id}\n` : ''}data: ${JSON.stringify(chunk)}\n\n`))
      } catch (error) {
        clearInterval(keepAlive)
        console.warn('reply stream failed', error)
        // Ending without a terminal chunk tells the client to reconnect.
        controller.close()
      }
    },
    cancel() {
      // The client went away; the reply keeps generating.
      clearInterval(keepAlive)
      abort.abort()
      void entries.return(undefined)
    },
  })
  return new Response(body, { headers: HEADERS })
}
