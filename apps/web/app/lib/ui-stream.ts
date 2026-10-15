import type { MessageMetadata } from "@flai/shared"
import type { UIMessageChunk } from "ai"

export type Chunk = UIMessageChunk<MessageMetadata>

/** A decoded event: the chunk plus its SSE `id`, when the server sent one. */
export interface StreamEvent {
  id?: string
  chunk: Chunk
}

/**
 * Decode an AI SDK UI message stream (SSE) into events. Comments (keep-alives) and the
 * terminal `[DONE]` marker are skipped; malformed events are ignored.
 */
export function parseStreamEvents(body: ReadableStream<Uint8Array>): ReadableStream<StreamEvent> {
  let buffer = ""
  return body.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).pipeThrough(
    new TransformStream<string, StreamEvent>({
      transform(text, controller) {
        buffer += text
        const events = buffer.split(/\r?\n\r?\n/)
        buffer = events.pop() ?? ""
        for (const event of events) emit(event, controller)
      },
      flush(controller) {
        if (buffer.trim()) emit(buffer, controller)
      },
    })
  )
}

/** Decode an AI SDK UI message stream (SSE) into chunks. */
export function parseUIMessageStream(body: ReadableStream<Uint8Array>): ReadableStream<Chunk> {
  return parseStreamEvents(body).pipeThrough(
    new TransformStream<StreamEvent, Chunk>({
      transform(event, controller) {
        controller.enqueue(event.chunk)
      },
    })
  )
}

function emit(event: string, controller: TransformStreamDefaultController<StreamEvent>) {
  const lines = event.split(/\r?\n/)
  const id = lines.findLast((line) => line.startsWith("id:"))?.slice(3).trim()
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n")
  if (!data || data === "[DONE]") return
  try {
    controller.enqueue({ id: id || undefined, chunk: JSON.parse(data) as Chunk })
  } catch {
    // ignore malformed event
  }
}
