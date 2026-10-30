import type { FlaiUIMessage, MessageRecord } from "@flai/shared"
import { textOf } from "@flai/shared"
import { cn } from "cn"
import { memo, useCallback, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import TextareaAutosize from "react-textarea-autosize"
import { Button } from "~/components/ui/button"
import { Message, MessageContent } from "~/components/ui/message"
import { answerQuestion, deleteLastMessage, editMessage, regenerate, sendMessage, switchSibling } from "../chat-store"
import { MessageActions } from "./message-actions"
import { MessageBody } from "./message-body"
import { SelectionPopover } from "./selection-popover"

interface MessageRowProps {
  /** The turn's latest record; actions apply to it. */
  message: MessageRecord
  /** Earlier assistant records of the same turn: questions the reply continued after. */
  earlier?: MessageRecord[]
  /** A continuation still streaming after the turn's answered question. */
  continuation?: FlaiUIMessage
  /** The message itself is a reply still streaming in. */
  streaming?: boolean
  isLast: boolean
  /** Actions are hidden while a reply is streaming. */
  busy: boolean
}

const sendFollowUp = (text: string) => void sendMessage({ text })
const NONE: MessageRecord[] = []

export const MessageRow = memo(function MessageRow({ message, earlier = NONE, continuation, streaming = false, isLast, busy }: MessageRowProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<string | null>(null)
  const isUser = message.role === "user"
  const bodyRef = useRef<HTMLDivElement>(null)

  // Stable props let the memoized action bars skip the renders of a streaming reply.
  const turn = useMemo(() => [...earlier, message], [earlier, message])
  const onRegenerate = useCallback(() => void regenerate(message.id), [message.id])
  const startEditing = useCallback(() => setEditing(textOf(message.parts)), [message.parts])

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
              className="w-full resize-none rounded-xl border border-input bg-card px-3 py-2 text-[15px] outline-none transition-colors duration-150 motion-reduce:transition-none hover:not-focus-visible:border-foreground/40 focus-visible:border-foreground"
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
          // One turn: consecutive records sit as close together as the parts within each one.
          <div ref={bodyRef} className="flex w-full min-w-0 flex-col gap-2">
            {earlier.map((record) => (
              <MessageBody key={record.id} role={record.role} parts={record.parts} metadata={record.metadata} onSend={busy ? undefined : sendFollowUp} />
            ))}
            <MessageBody
              role={message.role}
              parts={message.parts}
              metadata={message.metadata}
              streaming={streaming}
              onSend={busy && !streaming ? undefined : sendFollowUp}
              onAnswer={isLast && !busy ? (toolCallId, answer) => answerQuestion(message.id, toolCallId, answer) : undefined}
            />
            {continuation && (
              <MessageBody role="assistant" parts={continuation.parts} metadata={continuation.metadata} streaming onSend={sendFollowUp} />
            )}
            {!streaming && <SelectionPopover containerRef={bodyRef} context={textOf(message.parts)} />}
          </div>
        )}
        {/* Hidden rather than unmounted while busy: remounting every row's actions stalls the frame a reply finishes in.
            The streaming reply gets its own only when it finishes, or they would re-render with every frame. */}
        {editing === null && !streaming && (
          <div hidden={busy} className={cn(isUser && "md:opacity-0 md:transition-opacity md:group-hover/row:opacity-100 md:focus-within:opacity-100")}>
            <MessageActions
              message={message}
              turn={turn}
              isLast={isLast}
              onRegenerate={onRegenerate}
              onDelete={deleteLastMessage}
              onSwitch={switchSibling}
              onEdit={isUser ? startEditing : undefined}
            />
          </div>
        )}
      </MessageContent>
    </Message>
  )
})
