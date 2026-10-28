import type { FileRecord } from "@flai/shared"
import { MessageSquarePlusIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router"
import { ChatInput } from "~/components/chat-input"
import { Button } from "~/components/ui/button"
import { MessageScrollerProvider } from "~/components/ui/message-scroller"
import { closeConversation, isOffTopic, openConversation, sendMessage, stopGeneration, useChatStore, useVisibleMessages } from "~/features/chat/chat-store"
import { ChatThread, type FooterState } from "~/features/chat/components/chat-thread"
import { startConversation } from "~/features/chat/start-conversation"
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
  const navigate = useNavigate()
  // The draft flagged as a new topic; sending it unchanged again keeps it here.
  const [flagged, setFlagged] = useState<string | null>(null)
  const draft = useInputStore((s) => s.drafts[conversationId] ?? "")
  useEffect(() => {
    if (flagged !== null && draft.trim() !== flagged) setFlagged(null)
  }, [draft, flagged])

  const confirm = async ({ text }: { text: string }) => {
    if (flagged === text) return true
    if (!(await isOffTopic(text))) return true
    setFlagged(text)
    return false
  }

  /** Take the draft and hand it to `send`, putting it back if nothing was sent. */
  const sendDraft = async (send: (input: { text: string; files: FileRecord[] }) => Promise<boolean>) => {
    const store = useInputStore.getState()
    const input = { text: (store.drafts[conversationId] ?? "").trim(), files: store.attachments[conversationId] ?? [] }
    setFlagged(null)
    store.setDraft(conversationId, "")
    store.setAttachments(conversationId, [])
    if (!(await send(input))) {
      store.setDraft(conversationId, input.text)
      store.setAttachments(conversationId, input.files)
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {flagged !== null && (
        <TopicShiftNotice onStay={() => void sendDraft(sendMessage)} onNewChat={() => void sendDraft((input) => startConversation(input, navigate))} />
      )}
      <ChatInput
        draftKey={conversationId}
        autoFocus
        streaming={Boolean(streaming)}
        stopping={streaming?.stopping}
        onStop={() => void stopGeneration()}
        contextUsage={contextUsage}
        collapsed={collapsed}
        onExpand={expand}
        confirm={confirm}
        onSubmit={sendMessage}
      />
    </div>
  )
}

/** Floats above the input while a draft that changes the topic waits for a choice. */
function TopicShiftNotice({ onStay, onNewChat }: { onStay: () => void; onNewChat: () => void }) {
  const { t } = useTranslation()
  const p = "pages.chat.topicShift"
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl bg-card p-3 shadow-lg transition-[opacity,translate] duration-300 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-[opacity] sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
          <MessageSquarePlusIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{t(`${p}.title`)}</p>
          <p className="text-sm text-pretty text-muted-foreground">{t(`${p}.description`)}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button variant="ghost" onClick={onStay}>
          {t(`${p}.stay`)}
        </Button>
        <Button onClick={onNewChat}>
          {t(`${p}.newChat`)}
        </Button>
      </div>
    </div>
  )
}
