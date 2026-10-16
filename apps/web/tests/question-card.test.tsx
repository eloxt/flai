import type { AskUserAnswer, FlaiPart } from "@flai/shared"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MessageBody } from "~/features/chat/components/message-body"

vi.mock("~/components/genui/genui-block", () => ({ GenuiBlock: () => null }))
vi.mock("~/components/markdown", () => ({
  Markdown: ({ children }: { children: string }) => <p>{children}</p>,
}))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "pages.chat.question.yourAnswer": "Your answer",
        "pages.chat.question.otherAnswer": "Or write another answer",
        "pages.chat.question.submit": "Submit and continue",
        "pages.chat.question.submitting": "Submitting…",
      })[key] ?? key,
  }),
}))

afterEach(cleanup)

const question: FlaiPart = {
  type: "tool-ask_user",
  toolCallId: "q1",
  state: "input-available",
  input: {
    question: "Which language?",
    options: [
      { label: "English", description: "Use English" },
      { label: "中文" },
    ],
  },
}

describe("inline question card", () => {
  it("appears at the tool position, submits a selection, and folds after saving", async () => {
    const onAnswer = vi.fn().mockResolvedValue(true)
    const parts: FlaiPart[] = [
      { type: "text", text: "Before the question." },
      question,
      { type: "text", text: "After the question." },
    ]
    const { rerender } = render(
      <MessageBody role="assistant" parts={parts} onAnswer={onAnswer} />
    )
    const form = screen.getByRole("form", { name: "Which language?" })
    expect(
      screen.getByText("Before the question.").compareDocumentPosition(form) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      form.compareDocumentPosition(screen.getByText("After the question.")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Submit and continue" })
    ).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: "中文" }))
    await userEvent.click(
      screen.getByRole("button", { name: "Submit and continue" })
    )
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("q1", "中文")
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Which language?" })
      ).toHaveAttribute("aria-expanded", "false")
    )

    rerender(
      <MessageBody
        role="assistant"
        parts={[
          {
            ...question,
            state: "output-available",
            output: {
              answer: "中文",
              content: "User answered: 中文",
              isError: false,
            },
          },
        ]}
      />
    )
    expect(
      screen.getByRole("button", { name: "Which language? 中文" })
    ).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(
      screen.getByRole("button", { name: "Which language? 中文" })
    )
    expect(screen.getByLabelText("Your answer")).toHaveTextContent("中文")
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("supports multiple choices and a custom answer", async () => {
    const onAnswer = vi.fn().mockResolvedValue(true)
    render(
      <MessageBody
        role="assistant"
        parts={[
          {
            ...question,
            input: {
              ...(question.input as object),
              selectionMode: "multi_select",
            },
          },
        ]}
        onAnswer={onAnswer}
      />
    )
    await userEvent.click(
      screen.getByRole("button", { name: "English Use English" })
    )
    await userEvent.click(screen.getByRole("button", { name: "中文" }))
    await userEvent.type(screen.getByRole("textbox"), "日本語")
    await userEvent.click(
      screen.getByRole("button", { name: "Submit and continue" })
    )
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("q1", [
      "English",
      "中文",
      "日本語",
    ])
  })

  it("supports free text and rejects blank answers", async () => {
    const onAnswer = vi.fn().mockResolvedValue(true)
    render(
      <MessageBody
        role="assistant"
        parts={[
          {
            type: "dynamic-tool",
            toolName: "ask_user",
            toolCallId: "q2",
            state: "input-available",
            input: { question: "What is your name?" },
          },
        ]}
        onAnswer={onAnswer}
      />
    )
    await userEvent.type(screen.getByLabelText("Your answer"), "   ")
    expect(
      screen.getByRole("button", { name: "Submit and continue" })
    ).toBeDisabled()
    await userEvent.type(screen.getByLabelText("Your answer"), "Alex")
    await userEvent.click(
      screen.getByRole("button", { name: "Submit and continue" })
    )
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("q2", "Alex")
  })

  it("keeps the card open and preserves input when saving fails", async () => {
    const onAnswer = vi.fn().mockResolvedValue(false)
    render(
      <MessageBody role="assistant" parts={[question]} onAnswer={onAnswer} />
    )
    await userEvent.type(screen.getByRole("textbox"), "日本語")
    await userEvent.click(
      screen.getByRole("button", { name: "Submit and continue" })
    )
    expect(
      screen.getByRole("button", { name: "Which language?" })
    ).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("textbox")).toHaveValue("日本語")
    expect(
      screen.getByRole("button", { name: "Submit and continue" })
    ).toBeEnabled()
  })

  it("disables historical or still-streaming questions without an answer callback", () => {
    render(<MessageBody role="assistant" parts={[question]} streaming />)
    expect(screen.getByRole("textbox")).toBeDisabled()
    expect(screen.getByRole("button", { name: "中文" })).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "Submit and continue" })
    ).toBeDisabled()
  })

  it("restores answered questions in a collapsed, read-only state", () => {
    const answer: AskUserAnswer = ["English", "中文"]
    render(
      <MessageBody
        role="assistant"
        parts={[
          {
            ...question,
            state: "output-available",
            output: {
              answer,
              content: "User answered: English, 中文",
              isError: false,
            },
          },
        ]}
      />
    )
    expect(
      screen.getByRole("button", { name: "Which language? English, 中文" })
    ).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })
})
