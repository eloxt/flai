import { describe, expect, it } from "vitest"
import { applyGoogleCitations } from "~/features/chat/grounding"
import { splitSegments } from "~/features/chat/segments"

describe("splitSegments", () => {
  it("separates markdown from openui-lang fences and keeps other code fences as markdown", () => {
    const text = "Intro\n\n```openui-lang\nroot = Stack([a])\na = Text(\"hi\")\n```\n\n```ts\nconst x = 1\n```\nOutro"
    const segments = splitSegments(text)
    expect(segments.map((s) => s.kind)).toEqual(["markdown", "genui", "markdown"])
    expect(segments[1]).toEqual({ kind: "genui", code: 'root = Stack([a])\na = Text("hi")', complete: true })
    expect((segments[2] as { text: string }).text).toContain("```ts")
  })

  it("marks an unterminated fence as incomplete while streaming", () => {
    const segments = splitSegments("Look:\n```openui-lang\nroot = Stack([")
    expect(segments.at(-1)).toEqual({ kind: "genui", code: "root = Stack([", complete: false })
  })

  it("returns plain markdown untouched", () => {
    expect(splitSegments("just **text**")).toEqual([{ kind: "markdown", text: "just **text**" }])
  })
})

describe("applyGoogleCitations", () => {
  it("inserts numbered links using UTF-8 byte offsets without a second source list", () => {
    const text = "东京很棒。Paris too."
    // "东京很棒。" is 15 bytes in UTF-8.
    const out = applyGoogleCitations([text], {
      groundingChunks: [{ web: { uri: "https://a.example", title: "A" } }, { web: { uri: "https://b.example" } }],
      groundingSupports: [
        { segment: { startIndex: 0, endIndex: 15, text: "东京很棒。" }, groundingChunkIndices: [0] },
        { segment: { startIndex: 15, endIndex: 25, text: "Paris too." }, groundingChunkIndices: [1, 0] },
      ],
    })
    expect(out[0]).toBe("东京很棒。[[1]](<https://a.example>)Paris too.[[1]](<https://a.example>)[[2]](<https://b.example>)")
  })

  it("leaves text alone without grounding data", () => {
    expect(applyGoogleCitations(["x"], undefined)).toEqual(["x"])
  })

  it("keeps citations with their text block and handles URLs containing parentheses and spaces", () => {
    expect(
      applyGoogleCitations(["Intro", "Answer"], {
        groundingChunks: [
          { web: { uri: "https://example.com/a_(b)?q=two words" } },
        ],
        groundingSupports: [
          {
            segment: { text: "Answer", endIndex: 6 },
            groundingChunkIndices: [0],
          },
        ],
      })
    ).toEqual([
      "Intro",
      "Answer[[1]](<https://example.com/a_(b)?q=two%20words>)",
    ])
  })
})
