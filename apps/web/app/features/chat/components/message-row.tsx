import type { MessageRecord } from "@flai/shared"
import { textOf } from "@flai/shared"
import { cn } from "cn"
import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import TextareaAutosize from "react-textarea-autosize"
import { Button } from "~/components/ui/button"
import { Message, MessageContent } from "~/components/ui/message"
import { deleteLastMessage, editMessage, regenerate, sendMessage, switchSibling } from "../chat-store"
import { MessageActions } from "./message-actions"
import { MessageBody } from "./message-body"

interface MessageRowProps {
  message: MessageRecord
  isLast: boolean
  /** Actions are hidden while a reply is streaming. */
  busy: boolean
}

const sendFollowUp = (text: string) => void sendMessage({ text })

export const MessageRow = memo(function MessageRow({ message, isLast, busy }: MessageRowProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<string | null>(null)
  const isUser = message.role === "user"

  const submitEdit = () => {
    if (!editing?.trim() || busy) return
    void editMessage(message.id, editing)
    setEditing(null)
  }

  return (
    <Message align={isUser ? "end" : "start"} data-message-id={message.id}>
      <MessageContent className={cn("group/row gap-1", isUser ? "items-end" : "w-full")}>
        {editing !== null ? (
          <div className="flex w-full max-w-2xl flex-col gap-2 self-end">
            <TextareaAutosize
              autoFocus
              minRows={2}
              maxRows={12}
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(null)
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submitEdit()
                }
              }}
              className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-[15px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                {t("common.actions.cancel")}
              </Button>
              <Button onClick={submitEdit} disabled={busy || !editing.trim()}>
                {t("common.send")}
              </Button>
            </div>
          </div>
        ) : (
          <MessageBody role={message.role} parts={message.parts} metadata={message.metadata} onSend={busy ? undefined : sendFollowUp} />
        )}
        {editing === null && !busy && (
          <div className={cn(isUser && "md:opacity-0 md:transition-opacity md:group-hover/row:opacity-100 md:focus-within:opacity-100")}>
            <MessageActions
              message={message}
              isLast={isLast}
              onRegenerate={() => void regenerate(message.id)}
              onDelete={deleteLastMessage}
              onSwitch={(direction) => switchSibling(message.id, direction)}
              onEdit={isUser ? () => setEditing(textOf(message.parts)) : undefined}
            />
          </div>
        )}
      </MessageContent>
    </Message>
  )
})
