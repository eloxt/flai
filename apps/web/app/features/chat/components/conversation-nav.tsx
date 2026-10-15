import type { MessageRecord } from "@flai/shared"
import { textOf } from "@flai/shared"
import { cn } from "cn"
import { PaperclipIcon } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  useMessageScroller,
  useMessageScrollerVisibility,
} from "~/components/ui/message-scroller"
import { useChatStore } from "../chat-store"

/**
 * A conversation "section" is one user prompt plus everything that follows it. Its id is the user
 * message id, which is also the MessageScroller anchor id, so a tick scrolls straight to that turn.
 */
interface NavSection {
  id: string
  /** What the user said this turn. */
  title: string
  /** Head of this turn's answer text. */
  preview: string
  attachmentCount: number
}

/** Drop code fences (including generative UI programs) from previews; they would read as noise. */
const stripFences = (text: string) =>
  text
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()

/** The preview card shows ~3 clamped lines, so only the head of an answer matters. */
const PREVIEW_SCAN_CHARS = 600
const PREVIEW_MAX_CHARS = 300

/**
 * Slice the visible branch into "user prompt → answers" sections, plus a `message id → section id`
 * map: the scroller reports visible message ids, and this folds them back into sections.
 */
function toSections(messages: MessageRecord[], attachmentOnlyLabel: string) {
  const sections: NavSection[] = []
  const memberOf = new Map<string, string>()
  for (const message of messages) {
    if (message.role === "user") {
      sections.push({
        id: message.id,
        title: textOf(message.parts).trim() || attachmentOnlyLabel,
        preview: "",
        attachmentCount: message.parts.filter((p) => p.type === "file").length,
      })
      memberOf.set(message.id, message.id)
      continue
    }
    const current = sections.at(-1)
    if (!current) continue
    memberOf.set(message.id, current.id)
    if (current.preview.length >= PREVIEW_MAX_CHARS) continue
    const text = stripFences(textOf(message.parts).slice(0, PREVIEW_SCAN_CHARS))
    if (text)
      current.preview = current.preview ? `${current.preview}\n${text}` : text
  }
  return { sections, memberOf }
}

/** Resting tick length. */
const BASE_W = 8
/** Peak tick length, directly under the cursor. */
const PEAK_W = 34
/** Magnification radius (px): past this distance a tick rests at BASE_W. */
const RADIUS = 46

/** Fisheye magnification: cursor-to-tick distance → length, a cosine bell peaking at the cursor. */
function magnifiedWidth(dist: number): number {
  if (dist >= RADIUS) return BASE_W
  const f = 0.5 * (1 + Math.cos((Math.PI * dist) / RADIUS))
  return Math.round(BASE_W + (PEAK_W - BASE_W) * f)
}

/**
 * Conversation navigation rail: a floating column of horizontal ticks on the right edge of the
 * message column, one per user prompt. The current reading position is bold; turns on screen form
 * a softer band. Hovering applies cursor-tracked fisheye magnification and slides out a preview
 * card for the pointed-at turn; clicking a tick scrolls to it.
 *
 * Must render inside MessageScrollerProvider, and inside a `relative` box that spans the viewport.
 */
export function ConversationNav() {
  const { t } = useTranslation()
  const { scrollToMessage } = useMessageScroller()
  const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility()
  const map = useChatStore((s) => s.map)
  const path = useChatStore((s) => s.path)
  const streamingId = useChatStore((s) => s.streaming?.assistantId)
  const ulRef = useRef<HTMLUListElement>(null)
  // Per-tick current length; null = at rest. Magnification only applies while hovered / focused.
  const [widths, setWidths] = useState<number[] | null>(null)
  // Index of the tick under the cursor (or focus): drives the peak and the preview card.
  const [peak, setPeak] = useState<number | null>(null)

  const attachmentOnlyLabel = t("pages.chat.navAttachmentOnly")
  const { sections, memberOf } = useMemo(() => {
    const messages = path
      .map((id) => map[id])
      .filter((m): m is MessageRecord => Boolean(m))
    const result = toSections(messages, attachmentOnlyLabel)
    // The in-flight reply is not in the map yet but belongs to the last turn.
    const last = result.sections.at(-1)
    if (streamingId && last) result.memberOf.set(streamingId, last.id)
    return result
  }, [map, path, streamingId, attachmentOnlyLabel])

  const visibleSectionIds = useMemo(() => {
    const set = new Set<string>()
    for (const id of visibleMessageIds) {
      const section = memberOf.get(id)
      if (section) set.add(section)
    }
    return set
  }, [visibleMessageIds, memberOf])

  // A single turn has nothing to navigate.
  if (sections.length < 2) return null

  const currentId =
    sections.find((s) => s.id === currentAnchorId)?.id ?? sections[0].id

  function handleMove(e: React.MouseEvent) {
    const ul = ulRef.current
    if (!ul) return
    const ticks = Array.from(ul.querySelectorAll<HTMLElement>("[data-tick]"))
    let bestIndex = 0
    let bestDistance = Infinity
    const next = ticks.map((el, i) => {
      const r = el.getBoundingClientRect()
      const d = Math.abs(e.clientY - (r.top + r.height / 2))
      if (d < bestDistance) {
        bestDistance = d
        bestIndex = i
      }
      return magnifiedWidth(d)
    })
    setWidths(next)
    setPeak(bestIndex)
  }

  /** Keyboard focus: the same fisheye around that tick, distance estimated from the row pitch. */
  function handleFocus(index: number) {
    setPeak(index)
    setWidths(sections.map((_, j) => magnifiedWidth(Math.abs(j - index) * 9)))
  }

  function reset() {
    setWidths(null)
    setPeak(null)
  }

  // Lengths only transition at rest: while hovering they must track the cursor instantly.
  const settling = widths === null

  return (
    // The outer layer ignores pointer events so this transparent band never blocks scrolling or
    // text selection; the rail itself opts back in.
    <nav
      aria-label={t("pages.chat.navLabel")}
      className="pointer-events-none absolute inset-y-0 right-3 z-20 hidden items-center lg:flex"
    >
      <ul
        ref={ulRef}
        onMouseMove={handleMove}
        onMouseLeave={reset}
        className="pointer-events-auto flex flex-col items-end py-2"
      >
        {sections.map((s, i) => {
          const isCurrent = s.id === currentId
          const isVisible = visibleSectionIds.has(s.id)
          const isPeak = i === peak
          return (
            <li key={s.id} className="relative flex items-center">
              <button
                data-tick
                type="button"
                aria-label={s.title}
                aria-current={isCurrent ? "true" : undefined}
                onClick={() =>
                  scrollToMessage(s.id, { align: "start", behavior: "smooth" })
                }
                onFocus={() => handleFocus(i)}
                onBlur={reset}
                className="group/tick flex h-2.75 items-center justify-end outline-none"
              >
                <span
                  style={{ width: widths ? widths[i] : BASE_W }}
                  className={cn(
                    "h-0.5 rounded-full",
                    settling
                      ? "transition-[width,height,background-color] duration-200 ease-out motion-reduce:transition-none"
                      : "transition-[height,background-color] duration-150 motion-reduce:transition-none",
                    // Color encodes visibility and length encodes proximity; the two are independent.
                    isCurrent
                      ? "h-0.75 bg-primary"
                      : isVisible
                        ? "bg-primary/60"
                        : isPeak
                          ? "bg-muted-foreground/80"
                          : "bg-muted-foreground/35",
                    "group-focus-visible/tick:ring-2 group-focus-visible/tick:ring-ring/50 group-focus-visible/tick:ring-offset-2 group-focus-visible/tick:ring-offset-background"
                  )}
                />
              </button>

              {/* Mounted on demand: each card is a backdrop-blur subtree, too heavy to keep one per turn. */}
              {isPeak && (
                <div className="pointer-events-none absolute top-1/2 right-full z-30 mr-3 w-72 max-w-[min(20rem,40vw)] origin-right -translate-y-1/2 rounded-lg border bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur">
                  <div className="line-clamp-2 text-sm leading-snug font-medium">
                    {s.title}
                  </div>
                  {s.preview && (
                    <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {s.preview}
                    </p>
                  )}
                  {s.attachmentCount > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground/80">
                      <PaperclipIcon className="size-3 shrink-0" />
                      <span>
                        {t("pages.chat.navAttachments", {
                          count: s.attachmentCount,
                        })}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
