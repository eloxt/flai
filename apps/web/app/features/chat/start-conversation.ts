import type { Conversation, FileRecord } from "@flai/shared"
import type { NavigateFunction } from "react-router"
import i18n from "~/i18n"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"
import { useConversationStore } from "~/store/conversation-store"
import { useInputStore } from "~/store/input-store"

/** Create a conversation and open it; the chat page sends `text` once it is open. */
export async function startConversation(input: { text: string; files: FileRecord[] }, navigate: NavigateFunction): Promise<boolean> {
  try {
    const conversation = await api<Conversation>("/conversations", { method: "POST", body: {} })
    useConversationStore.getState().add({ ...conversation, title: i18n.t("components.sidebar.newChat") })
    useInputStore.getState().setPending({ conversationId: conversation.id, ...input })
    navigate(`/chat/${conversation.id}`)
    return true
  } catch (error) {
    notify.error(error)
    return false
  }
}
