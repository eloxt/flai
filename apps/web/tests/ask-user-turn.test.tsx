import type { FlaiPart, MessageRecord } from "@flai/shared"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MessageRow } from "~/features/chat/components/message-row"
import { groupTurns } from "~/features/chat/turns"

vi.mock("~/components/genui/genui-block", () => ({ GenuiBlock: () => null }))
vi.mock("~/components/markdown", () => ({
  Markdown: ({ children }: { children: string }) => <p>{children}</p>,
}))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}))

afterEach(cleanup)

const answered: FlaiPart = {
  type: "tool-ask_user",
  toolCallId: "q1",
  state: "output-available",
  input: { question: "Which language?", options: [{ label: "English" }, { label: "中文" }] },
  output: { answer: "中文", content: "User answered: 中文", isError: false },
}

function record(id: string, role: "user" | "assistant", parts: FlaiPart[], parentId: string | null): MessageRecord {
  return { id, parentId, role, parts, metadata: {}, createdAt: "2026-10-19T00:00:00.000Z" }
}

const user = record("u1", "user", [{ type: "text", text: "Write a greeting" }], null)
const question = record("a1", "assistant", [{ type: "text", text: "Let me ask first." }, answered], "u1")
const continuation = record("a2", "assistant", [{ type: "text", text: "你好！" }], "a1")

describe("ask_user turns", () => {
  it("groups a continuation with the question it answered", () => {
    expect(groupTurns([user, question, continuation]).map((turn) => turn.map((m) => m.id))).toEqual([["u1"], ["a1", "a2"]])
  })

  it("keeps ordinary replies and the next user message as their own turns", () => {
    const plain = record("a1", "assistant", [{ type: "text", text: "Hi" }], "u1")
    const next = record("u2", "user", [{ type: "text", text: "Again" }], "a1")
    const reply = record("a3", "assistant", [{ type: "text", text: "Hello" }], "u2")
    expect(groupTurns([user, plain, next, reply]).map((turn) => turn.length)).toEqual([1, 1, 1, 1])
    // A user message after a question starts a new turn too.
    expect(groupTurns([user, question, next]).map((turn) => turn.length)).toEqual([1, 1, 1])
  })

  it("renders the question and its continuation as one record with one action bar", () => {
    render(<MessageRow message={continuation} earlier={[question]} isLast busy={false} />)
    const rows = document.querySelectorAll("[data-message-id]")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute("data-message-id", "a2")
    expect(screen.getByText("Let me ask first.")).toBeVisible()
    expect(screen.getByText("你好！")).toBeVisible()
    expect(screen.getAllByRole("button", { name: "pages.chat.actions.copy" })).toHaveLength(1)
  })

  it("streams the continuation inside the question's record", () => {
    render(
      <MessageRow
        message={question}
        continuation={{ id: "a2", role: "assistant", parts: [{ type: "text", text: "正在写…" }] }}
        isLast={false}
        busy
      />
    )
    expect(document.querySelectorAll("[data-message-id]")).toHaveLength(1)
    expect(screen.getByText("正在写…")).toBeVisible()
  })
})
