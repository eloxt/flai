import { cjk } from "@streamdown/cjk"
import { code } from "@streamdown/code"
import { math } from "@streamdown/math"
import { mermaid } from "@streamdown/mermaid"
import { cn } from "cn"
import { memo } from "react"
import { Streamdown } from "streamdown"
import { ProxiedImage } from "~/components/proxied-image"
import "streamdown/styles.css"
import "katex/dist/katex.min.css"

const fullPlugins = { cjk, code, math, mermaid }
const lightPlugins = { cjk, math }
const components = { img: ProxiedImage }

interface MarkdownProps {
  children: string
  streaming?: boolean
  /** Reasoning and small GenUI text blocks skip code highlighting and diagrams. */
  light?: boolean
  className?: string
}

export const Markdown = memo(function Markdown({ children, streaming = false, light = false, className }: MarkdownProps) {
  return (
    <div className={cn("markdown-body w-full min-w-0", className)}>
      <Streamdown
        className="streamdown-content"
        animated={!light}
        isAnimating={streaming}
        plugins={light ? lightPlugins : fullPlugins}
        linkSafety={{ enabled: false }}
        components={components}
      >
        {children}
      </Streamdown>
    </div>
  )
})
