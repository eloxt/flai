import { cn } from "cn"

// Clockwise order around the 3×3 grid; the centre (index 4) sits outside the ring.
const RING = [0, 1, 2, 7, -1, 3, 6, 5, 4]

interface OrbProps {
  /** `waiting` ripples out from the centre; `thinking` swirls around it. */
  state?: "waiting" | "thinking"
  /** Accessible name; without one the orb is decorative. */
  label?: string
  className?: string
}

/** A 3×3 dot glyph that marks the agent as working before it has anything to show. */
export function Orb({ state = "waiting", label, className }: OrbProps) {
  return (
    <span
      data-slot="orb"
      data-state={state}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("orb", className)}
    >
      {RING.map((ring, i) => {
        const row = Math.floor(i / 3) - 1
        const col = (i % 3) - 1
        const radial = Math.hypot(row, col)
        return <span key={i} style={{ "--orb-radial": radial, "--orb-ring": ring } as React.CSSProperties} />
      })}
    </span>
  )
}
