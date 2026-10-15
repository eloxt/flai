import type { Conversation, Notification } from "@flai/shared"
import { InfoIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { ChatInput } from "~/components/chat-input"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"
import { useAppStore } from "~/store/app-store"
import { useConversationStore } from "~/store/conversation-store"
import { useInputStore } from "~/store/input-store"
import { useCurrentModel } from "~/store/model-store"

export default function Home() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const current = useCurrentModel()

  const start = async ({ text, files }: { text: string; files: import("@flai/shared").FileRecord[] }) => {
    if (!current) {
      notify.error(t("common.error.modelProviderNotFound"))
      return false
    }
    try {
      const conversation = await api<Conversation>("/conversations", { method: "POST", body: {} })
      useConversationStore.getState().add({ ...conversation, title: t("components.sidebar.newChat") })
      // The chat page picks this up and sends it once the conversation is open.
      useInputStore.getState().setPending({ conversationId: conversation.id, text, files })
      navigate(`/chat/${conversation.id}`)
      return true
    } catch (error) {
      notify.error(error)
      return false
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <Notifications />
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4 pb-[10vh]">
        <p className="text-center text-3xl font-medium text-balance">{t("pages.chat.greeting")}</p>
        <div className="w-full max-w-3xl">
          <ChatInput draftKey="new" autoFocus onSubmit={start} />
        </div>
      </div>
    </div>
  )
}

function Notifications() {
  const dismissed = useAppStore((s) => s.dismissedNotifications)
  const dismiss = useAppStore((s) => s.dismissNotification)
  const [items, setItems] = useState<Notification[]>([])

  useEffect(() => {
    api<Notification[]>("/notifications").then(setItems).catch(() => {})
  }, [])

  const visible = items.filter((n) => !dismissed.includes(n.id))
  if (visible.length === 0) return null
  return (
    <div className="absolute inset-x-0 top-4 z-10 flex flex-col items-center gap-2 px-4">
      {visible.map((n) => (
        <Alert key={n.id} variant={n.level === "warning" ? "destructive" : "default"} className="max-w-3xl">
          {n.level === "warning" ? <TriangleAlertIcon /> : <InfoIcon />}
          <AlertTitle>{n.title}</AlertTitle>
          {n.content && <AlertDescription className="whitespace-pre-wrap">{n.content}</AlertDescription>}
          <AlertAction>
            <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={() => dismiss(n.id)}>
              <XIcon />
            </Button>
          </AlertAction>
        </Alert>
      ))}
    </div>
  )
}
