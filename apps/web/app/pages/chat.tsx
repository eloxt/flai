import { useEffect } from "react"
import { useParams } from "react-router"
import { ChatInput } from "~/components/chat-input"
import { MessageScrollerProvider } from "~/components/ui/message-scroller"
import { closeConversation, openConversation, sendMessage, stopGeneration, useChatStore, useVisibleMessages } from "~/features/chat/chat-store"
import { ChatThread, type FooterState } from "~/features/chat/components/chat-thread"
import { useConversationStore } from "~/store/conversation-store"
import { useInputStore } from "~/store/input-store"
import { useCurrentModel } from "~/store/model-store"

export const meta = ({ params }: { params: { conversationId?: string } }) => {
  const conversation = useConversationStore
    .getState()
    .conversations.concat(useConversationStore.getState().favourites)
    .find((c) => c.id === params.conversationId)
  return [{ title: conversation?.title ? `FlaiChat - ${conversation.title}` : "FlaiChat" }]
}

export default function ChatPage() {
  const { conversationId = "" } = useParams()

  useEffect(() => {
    // StrictMode mounts effects twice in development; only the surviving mount may
    // consume the message queued on the landing page.
    let active = true
    queueMicrotask(() => {
      if (!active) return
      const pending = useInputStore.getState().pending
      if (pending?.conversationId === conversationId) {
        useInputStore.getState().setPending(null)
        void openConversation(conversationId, { empty: true })
        void useConversationStore.getState().generateTitle(conversationId, pending.text)
        void sendMessage({ text: pending.text, files: pending.files, parentId: null })
      } else {
        void openConversation(conversationId)
      }
    })
    return () => {
      active = false
      closeConversation()
    }
  }, [conversationId])

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <ChatThread key={conversationId} footer={(state) => <Composer conversationId={conversationId} {...state} />} />
    </MessageScrollerProvider>
  )
}

function Composer({ conversationId, collapsed, expand }: { conversationId: string } & FooterState) {
  const streaming = useChatStore((s) => s.streaming)
  const messages = useVisibleMessages()
  const contextLimit = useCurrentModel()?.model.limit?.context
  const lastUsage = [...messages].reverse().find((m) => m.role === "assistant")?.metadata.usage
  const used = (lastUsage?.inputTokens ?? 0) + (lastUsage?.outputTokens ?? 0)
  const contextUsage = contextLimit && used ? Math.min(100, (used / contextLimit) * 100) : undefined

  return (
    <ChatInput
      draftKey={conversationId}
      autoFocus
      streaming={Boolean(streaming)}
      stopping={streaming?.stopping}
      onStop={() => void stopGeneration()}
      contextUsage={contextUsage}
      collapsed={collapsed}
      onExpand={expand}
      onSubmit={({ text, files }) => sendMessage({ text, files })}
    />
  )
}
