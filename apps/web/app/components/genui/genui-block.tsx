import type { ActionEvent } from "@openuidev/react-lang"
import { Renderer } from "@openuidev/react-lang"
import { Component, type ReactNode } from "react"
import { genuiLibrary } from "./library"

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
  const handleAction = (event: ActionEvent) => {
    if (event.type === "open_url") {
      const url = String(event.params.url ?? "")
      if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener,noreferrer")
      return
    }
    if (event.type !== "continue_conversation" || !onSend) return
    const form = describeForm(event.formState)
    const context = event.params.context
    const parts = [
      event.humanFriendlyMessage,
      form && `\n${form}`,
      context !== undefined && context !== null ? `\nContext: ${JSON.stringify(context)}` : "",
    ]
    onSend(parts.filter(Boolean).join("\n").trim())
  }

  return (
    <GenuiBoundary fallback={<pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{code}</pre>}>
      <div className="my-2 w-full min-w-0 rounded-xl border bg-card p-3 text-card-foreground" data-slot="genui">
        <Renderer response={code} library={genuiLibrary} isStreaming={streaming} onAction={handleAction} />
      </div>
    </GenuiBoundary>
  )
}

class GenuiBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
