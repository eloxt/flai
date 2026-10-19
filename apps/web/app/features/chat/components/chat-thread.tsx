import { Message, MessageContent } from "~/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
} from "~/components/ui/message-scroller"
import { Skeleton } from "~/components/ui/skeleton"
import { sendMessage, useChatStore, useVisibleMessages } from "../chat-store"
import { asksUser, groupTurns } from "../turns"
import { ConversationNav } from "./conversation-nav"
import { MessageBody } from "./message-body"
import { MessageRow } from "./message-row"

const sendFollowUp = (text: string) => void sendMessage({ text })

/** The scrolling transcript of the open conversation. Must be inside MessageScrollerProvider. */
export function ChatThread({ footer }: { footer: React.ReactNode }) {
  const loading = useChatStore((s) => s.loading)
  const streaming = useChatStore((s) => s.streaming)
  const answering = useChatStore((s) => s.answering)
  const messages = useVisibleMessages()
  const turns = groupTurns(messages)
  // Continuing after an answered question: stream into the question's turn.
  const lastMessage = messages.at(-1)
  const streamingJoinsTurn = Boolean(streaming && lastMessage?.id === streaming.parentId && asksUser(lastMessage))

  return (
    <MessageScroller className="min-h-0 flex-1">
      <div className="relative min-h-0 flex-1">
        <MessageScrollerViewport>
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
        <MessageScrollerButton size="icon-lg" className="z-10 rounded-full" />
      </div>
      <div className="mx-auto w-full max-w-4xl shrink-0 px-4 pb-4 md:px-8">
        {footer}
      </div>
    </MessageScroller>
  )
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
