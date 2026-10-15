import { cn } from "cn"
import type * as React from "react"

/**
 * The FlaiChat mark: an F beside a text caret (reads as "Fl", and as typing). Rectangles on
 * a 24-unit grid in the text colour, so it sizes and colours like the other icons.
 * Keep in sync with scripts/generate-icons.mjs, which draws the app icons from the same grid.
 */
export function FlaiMark({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={cn("shrink-0", className)} {...props}>
      <rect x="3" y="3" width="3.5" height="18" />
      <rect x="6.5" y="3" width="10.5" height="3.5" />
      <rect x="6.5" y="10" width="6.5" height="3.5" />
      <rect x="17" y="10" width="3" height="11" />
    </svg>
  )
}
