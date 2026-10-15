import type { GoogleGrounding } from "@flai/shared"

const encoder = new TextEncoder()

/** Gemini reports segment offsets in UTF-8 bytes; convert to a JS string index. */
function byteOffsetToCharIndex(text: string, byteOffset: number): number {
  if (byteOffset <= 0) return 0
  let consumed = 0
  for (let i = 0; i < text.length; ) {
    const codePoint = text.codePointAt(i)!
    const char = String.fromCodePoint(codePoint)
    const next = consumed + encoder.encode(char).length
    if (next >= byteOffset) return next === byteOffset ? i + char.length : i
    consumed = next
    i += char.length
  }
  return text.length
}

/**
 * Insert Gemini grounding citations as markdown footnotes into the message's text blocks.
 * Returns new texts (same order as input); blocks without citations are returned unchanged.
 */
export function applyGoogleFootnotes(texts: string[], grounding: GoogleGrounding | undefined): string[] {
  const chunks = grounding?.groundingChunks ?? []
  const supports = grounding?.groundingSupports ?? []
  if (texts.length === 0 || chunks.length === 0 || supports.length === 0) return texts

  const insertions = new Map<number, Map<number, number[]>>()
  for (const support of supports) {
    const end = support.segment?.endIndex
    const indices = [...new Set((support.groundingChunkIndices ?? []).filter((i) => chunks[i]?.web?.uri))].sort((a, b) => a - b)
    if (end === undefined || end < 0 || indices.length === 0) continue
    const start = support.segment?.startIndex ?? 0
    const segment = support.segment?.text

    let block = -1
    let at = -1
    for (let b = 0; b < texts.length; b++) {
      const text = texts[b]!
      const s = byteOffsetToCharIndex(text, start)
      const e = byteOffsetToCharIndex(text, end)
      if (!segment || text.slice(s, e) === segment) {
        block = b
        at = e
        break
      }
    }
    if (block === -1 && segment) {
      for (let b = texts.length - 1; b >= 0; b--) {
        const i = texts[b]!.lastIndexOf(segment)
        if (i !== -1) {
          block = b
          at = i + segment.length
          break
        }
      }
    }
    if (block === -1) {
      if (texts.length !== 1) continue
      block = 0
      at = byteOffsetToCharIndex(texts[0]!, end)
    }

    const forBlock = insertions.get(block) ?? new Map<number, number[]>()
    const existing = forBlock.get(at) ?? []
    for (const i of indices) if (!existing.includes(i)) existing.push(i)
    forBlock.set(at, existing.sort((a, b) => a - b))
    insertions.set(block, forBlock)
  }
  if (insertions.size === 0) return texts

  const referenced = new Set<number>()
  const out = texts.map((text, b) => {
    const points = [...(insertions.get(b)?.entries() ?? [])].sort((x, y) => y[0] - x[0])
    let result = text
    for (const [at, indices] of points) {
      indices.forEach((i) => referenced.add(i))
      result = result.slice(0, at) + indices.map((i) => `[^${i + 1}]`).join("") + result.slice(at)
    }
    return result
  })

  const lines = [...referenced]
    .sort((a, b) => a - b)
    .flatMap((i) => {
      const web = chunks[i]?.web
      if (!web?.uri) return []
      const title = web.title?.trim()
      return [title ? `[^${i + 1}]: [${title}](${web.uri})` : `[^${i + 1}]: ${web.uri}`]
    })
  if (lines.length) out[out.length - 1] = `${out.at(-1)}\n\n${lines.join("\n")}`
  return out
}
