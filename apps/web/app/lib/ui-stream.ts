import type { MessageMetadata } from "@flai/shared"
import type { UIMessageChunk } from "ai"

export type Chunk = UIMessageChunk<MessageMetadata>

/**
 * Decode an AI SDK UI message stream (SSE) into chunks. Comments (keep-alives) and the
 * terminal `[DONE]` marker are skipped; malformed events are ignored.
 */
export function parseUIMessageStream(body: ReadableStream<Uint8Array>): ReadableStream<Chunk> {
  let buffer = ""
  return body.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).pipeThrough(
    new TransformStream<string, Chunk>({
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

function emit(event: string, controller: TransformStreamDefaultController<Chunk>) {
  const data = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n")
  if (!data || data === "[DONE]") return
  try {
    controller.enqueue(JSON.parse(data) as Chunk)
  } catch {
    // ignore malformed event
  }
}
