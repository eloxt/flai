import { GENUI_FENCE } from "@flai/shared/genui"

export type Segment = { kind: "markdown"; text: string } | { kind: "genui"; code: string; complete: boolean }

const OPEN = new RegExp("^(`{3,})" + GENUI_FENCE.replace(/[-]/g, "\\-") + "[ \\t]*$")

/**
 * Split assistant text into markdown and OpenUI Lang segments. Only fences tagged with the
 * GenUI language become UI; an unterminated fence (still streaming) yields an incomplete segment.
 */
export function splitSegments(text: string): Segment[] {
  const lines = text.split("\n")
  const segments: Segment[] = []
  let markdown: string[] = []
  let code: string[] | null = null
  let fence = ""

  const flushMarkdown = () => {
    if (markdown.join("\n").trim()) segments.push({ kind: "markdown", text: markdown.join("\n") })
    markdown = []
  }

  for (const line of lines) {
    if (code === null) {
      const match = OPEN.exec(line.trim())
      if (match) {
        flushMarkdown()
        code = []
        fence = match[1]!
      } else {
        markdown.push(line)
      }
      continue
    }
    if (line.trim().startsWith(fence) && line.trim().replace(/`/g, "") === "") {
      segments.push({ kind: "genui", code: code.join("\n"), complete: true })
      code = null
      continue
    }
    code.push(line)
  }
  if (code !== null) segments.push({ kind: "genui", code: code.join("\n"), complete: false })
  flushMarkdown()
  return segments
}
