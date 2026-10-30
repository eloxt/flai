import type { FlaiPart, MessageRecord } from "@flai/shared"
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerScrollable,
} from "~/components/ui/message-scroller"
import { Skeleton } from "~/components/ui/skeleton"
import { useChatStore, useVisibleMessages } from "../chat-store"
import { asksUser, groupTurns } from "../turns"
import { ConversationNav } from "./conversation-nav"
import { MessageRow } from "./message-row"

const NONE: MessageRecord[] = []
const Nav = memo(ConversationNav)

const SCROLL_UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"])
const SCROLL_DOWN_KEYS = new Set(["ArrowDown", "PageDown", "End"])

export interface FooterState {
  /** The reader scrolled back through the transcript; the footer should shrink to a bar. */
  collapsed: boolean
  expand: () => void
}

/** The scrolling transcript of the open conversation. Must be inside MessageScrollerProvider. */
export function ChatThread({ footer }: { footer: (state: FooterState) => React.ReactNode }) {
  const loading = useChatStore((s) => s.loading)
  const streaming = useChatStore((s) => s.streaming)
  const answering = useChatStore((s) => s.answering)
  const messages = useVisibleMessages()
  const turns = useMemo(() => groupTurns(messages).map((turn) => ({ turn, earlier: turn.length > 1 ? turn.slice(0, -1) : NONE })), [messages])
  // Continuing after an answered question: stream into the question's turn.
  const lastMessage = messages.at(-1)
  const streamingJoinsTurn = Boolean(streaming && lastMessage?.id === streaming.parentId && asksUser(lastMessage))
  // A new reply streams as the turn it becomes: same key, same row, so finishing it changes no
  // scroller item. Swapping the item makes MessageScroller re-anchor and jump the reader away.
  const reply: MessageRecord | null = streaming && !streamingJoinsTurn
    ? {
        id: streaming.assistantId,
        parentId: streaming.parentId,
        role: "assistant",
        parts: streaming.message.parts as FlaiPart[],
        metadata: streaming.message.metadata ?? {},
        createdAt: "",
      }
    : null
  const { collapsed, expand, viewportProps, onScrollToEnd } = useCollapseWhileReading()

  return (
    <MessageScroller className="min-h-0 flex-1">
      <div className="relative min-h-0 flex-1">
        <MessageScrollerViewport {...viewportProps}>
          <MessageScrollerContent className="mx-auto w-full max-w-4xl gap-8 px-4 pt-4 pb-6 md:px-8">
            {loading ? (
              <MessageScrollerItem>
                <ThreadSkeleton />
              </MessageScrollerItem>
            ) : (
              (reply ? [...turns, { turn: [reply], earlier: NONE }] : turns).map(({ turn, earlier }, index, all) => {
                const last = index === all.length - 1
                const message = turn.at(-1)!
                const streamingReply = message === reply
                return (
                  <MessageScrollerItem
                    key={turn[0]!.id}
                    messageId={turn[0]!.id}
                    scrollAnchor={message.role === "user"}
                  >
                    <MessageRow
                      message={message}
                      earlier={earlier}
                      continuation={last && streamingJoinsTurn ? streaming!.message : undefined}
                      streaming={streamingReply}
                      isLast={!streaming && last}
                      busy={Boolean(streaming) || answering}
                    />
                  </MessageScrollerItem>
                )
              })
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <Nav />
        <MessageScrollerButton size="icon-lg" className="z-10 rounded-lg bg-card shadow-md hover:bg-muted" onClick={onScrollToEnd} />
      </div>
      <div className="mx-auto w-full max-w-4xl shrink-0 px-4 pb-6 md:px-8">
        {footer({ collapsed, expand })}
      </div>
    </MessageScroller>
  )
}

/**
 * Collapses on scrolling up (the reader went back into history) and expands again at the bottom.
 * Only upward intent collapses: the footer's height change near the bottom must not re-trigger it.
 */
function useCollapseWhileReading() {
  const { start: canScrollUp, end: canScrollDown } = useMessageScrollerScrollable()
  const { scrollToEnd } = useMessageScroller()
  const [collapsed, setCollapsed] = useState(false)
  // Collapsing near the bottom grows the viewport and clamps it back to the end. Reaching
  // the end only expands when the reader was heading down, or it would expand at once.
  const headingUp = useRef(false)
  const reachedEnd = useRef(false)
  const touchY = useRef(0)

  const collapse = () => {
    headingUp.current = true
    if (canScrollUp) setCollapsed(true)
  }
  const expandAtEnd = () => {
    reachedEnd.current = true
    setCollapsed(false)
  }
  const scrollDown = () => {
    headingUp.current = false
    // Already at the end (the clamped case above): there is no scroll left to get there.
    if (collapsed && !canScrollDown) expandAtEnd()
  }

  useEffect(() => {
    if (collapsed && !canScrollDown && !headingUp.current) expandAtEnd()
  }, [canScrollDown, collapsed])

  // The expanded footer takes room from the viewport; stay pinned to the last message.
  useLayoutEffect(() => {
    if (collapsed || !reachedEnd.current) return
    reachedEnd.current = false
    scrollToEnd({ behavior: "instant" })
  }, [collapsed, scrollToEnd])

  const expand = useCallback(() => setCollapsed(false), [])

  const viewportProps = {
    onWheel: (e: React.WheelEvent) => {
      if (e.deltaY < 0) collapse()
      else if (e.deltaY > 0) scrollDown()
    },
    onTouchStart: (e: React.TouchEvent) => {
      touchY.current = e.touches[0]!.clientY
    },
    onTouchMove: (e: React.TouchEvent) => {
      const dy = e.touches[0]!.clientY - touchY.current
      if (dy > 8) collapse()
      else if (dy < -8) scrollDown()
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (SCROLL_UP_KEYS.has(e.key) || (e.key === " " && e.shiftKey)) collapse()
      else if (SCROLL_DOWN_KEYS.has(e.key) || e.key === " ") scrollDown()
    },
  }

  return { collapsed, expand, viewportProps, onScrollToEnd: () => (headingUp.current = false) }
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="ml-auto h-10 w-2/5 rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <Skeleton className="ml-auto h-10 w-1/3 rounded-xl" />
    </div>
  )
}
