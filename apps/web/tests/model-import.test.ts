import { describe, expect, it } from "vitest"
import { extractModels } from "~/lib/model-import"

describe("extractModels", () => {
  it("normalizes snake_case entries and drops unsupported tools", () => {
    const [model] = extractModels([{ id: "m1", tool_call: true, thinking_levels: ["low", "high"], internal_tools: ["image_generation", "web_search"], limit: { context: 1000 } }])
    expect(model).toMatchObject({ id: "m1", name: "m1", toolCall: true, thinkingLevels: ["low", "high"], internalTools: ["web_search"], limit: { context: 1000 } })
  })

  it("accepts wrappers, models.dev maps and plain ids", () => {
    expect(extractModels({ models: [{ id: "a" }] }).map((m) => m.id)).toEqual(["a"])
    expect(extractModels({ models: { "gpt-x": { name: "GPT X", reasoning: true } } })).toMatchObject([{ id: "gpt-x", name: "GPT X", reasoning: true }])
    expect(extractModels(["x", "y"]).map((m) => m.id)).toEqual(["x", "y"])
    expect(extractModels({ id: "solo", internal_search: true })).toMatchObject([{ id: "solo", internalTools: ["web_search"] }])
  })

  it("ignores garbage", () => {
    expect(extractModels(42)).toEqual([])
    expect(extractModels([{ name: "" }, null])).toEqual([])
  })
})
