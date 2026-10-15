import { describe, expect, it } from "vitest"
import { parseUIMessageStream } from "~/lib/ui-stream"

function streamOf(chunks: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
}

async function collect(chunks: string[]) {
  const out: unknown[] = []
  for await (const chunk of parseUIMessageStream(streamOf(chunks))) out.push(chunk)
  return out
}

describe("parseUIMessageStream", () => {
  it("parses events split across network chunks, skipping keep-alives and [DONE]", async () => {
    const out = await collect([': keep-alive\n\ndata: {"type":"st', 'art","messageId":"m"}\r\n\r\ndata: {"type":"text-delta","id":"t","delta":"hi"}\n\n', "data: [DONE]"])
    expect(out).toEqual([
      { type: "start", messageId: "m" },
      { type: "text-delta", id: "t", delta: "hi" },
    ])
  })

  it("handles a final event without a trailing blank line and ignores malformed JSON", async () => {
    expect(await collect(["data: {bad\n\n", 'data: {"type":"finish"}'])).toEqual([{ type: "finish" }])
  })
})
