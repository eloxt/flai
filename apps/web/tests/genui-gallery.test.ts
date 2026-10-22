import { createParser } from "@openuidev/react-lang"
import { describe, expect, it } from "vitest"
import { imageLibrary } from "~/components/genui/image-library"
import { sampleGroups } from "~/features/genui-gallery/samples"

const parser = createParser(imageLibrary.toJSONSchema(), imageLibrary.root)
const samples = sampleGroups.flatMap((group) =>
  group.samples.map((sample) => ({
    ...sample,
    id: `${group.name} / ${sample.title}`,
  }))
)

describe("gallery samples", () => {
  it.each(samples)("$id parses without errors", ({ code }) => {
    const parsed = parser.parse(code)
    expect(parsed.root).not.toBeNull()
    expect(parsed.meta.errors).toEqual([])
    expect(parsed.meta.unresolved).toEqual([])
  })

  it("covers every component and function the renderer knows", () => {
    const shown = new Set(samples.flatMap((sample) => sample.components))
    const missing = [
      ...Object.keys(imageLibrary.components),
      ...Object.keys(imageLibrary.functions).map((name) => `@${name}`),
    ].filter(
      (name) =>
        !shown.has(name) &&
        !samples.some((sample) => sample.code.includes(name))
    )
    expect(missing).toEqual([])
  })
})
