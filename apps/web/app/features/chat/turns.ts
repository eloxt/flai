import type { MessageRecord } from "@flai/shared"
import { isAskUserPart } from "@flai/shared"

/** Whether a reply that follows this message continues it, after an ask_user answer. */
export function asksUser(message: MessageRecord | undefined): boolean {
  return message?.role === "assistant" && message.parts.some(isAskUserPart)
}

/** A continuation is stored as its own message but reads as one turn with its question. */
export function groupTurns(messages: MessageRecord[]): MessageRecord[][] {
  const turns: MessageRecord[][] = []
  for (const message of messages) {
    const turn = turns.at(-1)
    if (turn && message.role === "assistant" && asksUser(turn.at(-1))) turn.push(message)
    else turns.push([message])
  }
  return turns
}
