import type { ActionEvent } from "@openuidev/react-lang"
import { Renderer } from "@openuidev/react-lang"
import { ThemeProvider as OpenuiThemeProvider } from "@openuidev/react-ui"
import { useRef } from "react"
import { useTheme } from "~/components/theme-provider"
import { ImageSourceContext } from "~/hooks/use-proxied-images"
import { GenuiBoundary } from "./genui-boundary"
import { genuiTheme } from "./theme"
import { imageLibrary } from "./image-library"
import "./genui.css"

interface GenuiBlockProps {
  code: string
  streaming: boolean
  /** Called when the UI asks to continue the conversation (buttons, form submits). */
  onSend?: (text: string) => void
}

function describeForm(state: unknown): string {
  if (!state || typeof state !== "object") return ""
  const lines: string[] = []
  for (const [form, fields] of Object.entries(state as Record<string, unknown>)) {
    if (!fields || typeof fields !== "object") continue
    for (const [name, field] of Object.entries(fields as Record<string, unknown>)) {
      const value = field && typeof field === "object" && "value" in field ? (field as { value: unknown }).value : field
      if (value !== undefined && value !== "") lines.push(`- ${form}.${name}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    }
  }
  return lines.join("\n")
}

/** Renders one OpenUI Lang program; malformed programs never break the surrounding message. */
export function GenuiBlock({ code, streaming, onSend }: GenuiBlockProps) {
  const { resolved } = useTheme()
  const imageSources = useRef(new Map<string, string>()).current
  const handleAction = (event: ActionEvent) => {
    if (event.type === "open_url") {
      const url = String(event.params.url ?? "")
      if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener,noreferrer")
      return
    }
    if (event.type !== "continue_conversation" || !onSend) return
    const form = describeForm(event.formState)
    const context = event.params.context
    const contextText = context !== undefined && context !== null
      ? JSON.stringify(context, (_key, value) => {
          if (typeof value !== "string") return value
          for (const [objectUrl, originalUrl] of imageSources) value = value.replaceAll(objectUrl, originalUrl)
          return value
        })
      : ""
    const parts = [
      event.humanFriendlyMessage,
      form && `\n${form}`,
      contextText ? `\nContext: ${contextText}` : "",
    ]
    onSend(parts.filter(Boolean).join("\n").trim())
  }

  return (
    <GenuiBoundary fallback={<pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{code}</pre>}>
      <div className="my-4 w-full min-w-0" data-slot="genui">
        <OpenuiThemeProvider mode={resolved} lightTheme={genuiTheme} darkTheme={genuiTheme}>
          <ImageSourceContext value={imageSources}>
            <Renderer response={code} library={imageLibrary} isStreaming={streaming} onAction={handleAction} />
          </ImageSourceContext>
        </OpenuiThemeProvider>
      </div>
    </GenuiBoundary>
  )
}
