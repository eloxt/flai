import type { FlaiPart } from "@flai/shared"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MessageBody } from "~/features/chat/components/message-body"

vi.mock("~/components/genui/genui-block", () => ({ GenuiBlock: () => null }))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`),
  }),
}))
vi.mock("~/components/markdown", () => ({
  Markdown: ({ children }: { children: string }) => <p>{children}</p>,
}))

afterEach(cleanup)

const reasoning = { type: "reasoning", text: "Secret chain of thought" } as FlaiPart
const search = (state: string, id = "search-1") =>
  ({ type: "tool-web_search", toolCallId: id, state, input: { query: "flai" }, output: { results: [] } }) as unknown as FlaiPart

describe("assistant activity", () => {
  it("shows only the orb before anything streams", () => {
    const { container } = render(<MessageBody role="assistant" parts={[{ type: "step-start" } as FlaiPart]} streaming />)
    expect(screen.getByRole("img", { name: "pages.chat.pending" })).toHaveAttribute("data-state", "waiting")
    expect(container).not.toHaveTextContent("pages.chat.activity.thinking")
  })

  it("shows only a thinking status while reasoning, never the reasoning text", () => {
    const { container } = render(<MessageBody role="assistant" parts={[reasoning]} streaming />)
    expect(screen.getByText("pages.chat.activity.thinking")).toBeVisible()
    expect(container.querySelector('[data-slot="orb"]')).toHaveAttribute("data-state", "thinking")
    expect(screen.queryByText("Secret chain of thought")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("describes the running tool and returns to thinking once it completes", () => {
    const { container, rerender } = render(<MessageBody role="assistant" parts={[reasoning, search("input-available")]} streaming />)
    expect(screen.getByText("components.tools.webSearch.running")).toBeVisible()
    expect(screen.getByText("flai")).toBeVisible()
    expect(screen.queryByText("web_search")).toBeNull()
    expect(container.querySelector('[data-slot="orb"]')).toBeNull()
    rerender(<MessageBody role="assistant" parts={[reasoning, search("output-available")]} streaming />)
    expect(screen.getByText("pages.chat.activity.thinking")).toBeVisible()
  })

  it("summarises a finished run and expands to every tool call's details", async () => {
    render(
      <MessageBody
        role="assistant"
        parts={[
          reasoning,
          search("output-available"),
          { ...search("output-error", "search-2"), errorText: "Exa rate limit exceeded" } as FlaiPart,
          { type: "text", text: "Answer" },
        ]}
      />
    )
    const status = screen.getByRole("button", { name: /pages\.chat\.activity\.usedTools:2/ })
    expect(status).toHaveTextContent("pages.chat.activity.failed:1")
    expect(screen.queryByText("Secret chain of thought")).toBeNull()
    await userEvent.click(status)
    expect(status).toHaveTextContent("components.tools.webSearch.done")
    // One row per call, numbered, each identified by its first argument.
    expect(screen.getAllByText("flai")).toHaveLength(2)
    expect(screen.getByText("01")).toBeVisible()
    expect(screen.getByText("02")).toBeVisible()
    expect(screen.getByText("Exa rate limit exceeded")).toBeVisible()
    expect(screen.getByText("Answer")).toBeVisible()
  })

  it("keeps an MCP tool's own title", () => {
    const mcp = { type: "dynamic-tool", toolName: "notion_search", title: "Notion search", toolCallId: "mcp-1", state: "input-available", input: {} }
    render(<MessageBody role="assistant" parts={[mcp as unknown as FlaiPart]} streaming />)
    expect(screen.getByText("Notion search")).toBeVisible()
  })

  it("keeps separate activity runs around interleaved text", () => {
    render(
      <MessageBody
        role="assistant"
        parts={[search("output-available"), { type: "text", text: "Let me check one more page." }, reasoning, { type: "text", text: "Done" }]}
      />
    )
    expect(screen.getByText("pages.chat.activity.usedTools:1")).toBeVisible()
    expect(screen.getByText("pages.chat.activity.thought")).toBeVisible()
  })
})
