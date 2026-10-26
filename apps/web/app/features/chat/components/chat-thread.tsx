import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Message, MessageContent } from "~/components/ui/message"
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
import { sendMessage, useChatStore, useVisibleMessages } from "../chat-store"
import { asksUser, groupTurns } from "../turns"
import { ConversationNav } from "./conversation-nav"
import { MessageBody } from "./message-body"
import { MessageRow } from "./message-row"

const sendFollowUp = (text: string) => void sendMessage({ text })
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
  const turns = groupTurns(messages)
  // Continuing after an answered question: stream into the question's turn.
  const lastMessage = messages.at(-1)
  const streamingJoinsTurn = Boolean(streaming && lastMessage?.id === streaming.parentId && asksUser(lastMessage))
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
              <>
                {turns.map((turn, index) => {
                  const last = index === turns.length - 1
                  const message = turn.at(-1)!
                  return (
                    <MessageScrollerItem
                      key={turn[0]!.id}
                      messageId={turn[0]!.id}
                      scrollAnchor={message.role === "user"}
                    >
                      <MessageRow
                        message={message}
                        earlier={turn.slice(0, -1)}
                        continuation={last && streamingJoinsTurn ? streaming!.message : undefined}
                        isLast={!streaming && last}
                        busy={Boolean(streaming) || answering}
                      />
                    </MessageScrollerItem>
                  )
                })}
                {streaming && !streamingJoinsTurn && (
                  <MessageScrollerItem
                    key={streaming.assistantId}
                    messageId={streaming.assistantId}
                  >
                    <Message
                      align="start"
                      data-message-id={streaming.assistantId}
                    >
                      <MessageContent className="w-full">
                        <MessageBody
                          role="assistant"
                          parts={streaming.message.parts}
                          metadata={streaming.message.metadata}
                          streaming
                          onSend={sendFollowUp}
                        />
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )}
              </>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <ConversationNav />
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

  return { collapsed, expand: () => setCollapsed(false), viewportProps, onScrollToEnd: () => (headingUp.current = false) }
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
