import type { GoogleGrounding } from "@flai/shared"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MessageBody } from "~/features/chat/components/message-body"

vi.mock("~/components/genui/genui-block", () => ({ GenuiBlock: () => null }))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "pages.chat.sources" ? "来源" : key),
  }),
}))
vi.mock("~/components/markdown", () => ({
  Markdown: ({ children }: { children: string }) => <p>{children}</p>,
}))

afterEach(cleanup)

describe("message sources", () => {
  it("renders OpenAI and Gemini sources with the same list markup", async () => {
    const { rerender } = render(
      <MessageBody
        role="assistant"
        parts={[
          {
            type: "source-url",
            sourceId: "a",
            url: "https://a.example",
            title: "来源 A",
          },
          {
            type: "source-url",
            sourceId: "b",
            url: "https://b.example",
            title: "Source B",
          },
        ]}
      />
    )
    await userEvent.click(screen.getByRole("button", { name: "来源 · 2" }))
    const openai = screen.getByRole("list").outerHTML
    rerender(
      <MessageBody
        role="assistant"
        parts={[]}
        metadata={{
          googleGrounding: {
            groundingChunks: [
              { web: { uri: "https://a.example", title: "来源 A" } },
              { web: { uri: "https://b.example", title: "Source B" } },
            ],
          },
        }}
      />
    )
    expect(screen.getByRole("list").outerHTML).toBe(openai)
  })

  it("preserves Gemini citation numbers and merges streamed sources without duplicates", async () => {
    const grounding: GoogleGrounding = {
      groundingChunks: [
        {},
        { web: { uri: "https://b.example", title: "Source B" } },
      ],
      groundingSupports: [
        {
          segment: { text: "Answer.", endIndex: 7 },
          groundingChunkIndices: [1],
        },
      ],
    }
    const { rerender } = render(
      <MessageBody
        role="assistant"
        parts={[
          { type: "text", text: "Answer." },
          {
            type: "source-url",
            sourceId: "b",
            url: "https://b.example",
            title: "Source B",
          },
        ]}
        streaming
      />
    )
    rerender(
      <MessageBody
        role="assistant"
        parts={[
          { type: "text", text: "Answer." },
          {
            type: "source-url",
            sourceId: "b",
            url: "https://b.example",
            title: "Source B",
          },
        ]}
        metadata={{ googleGrounding: grounding }}
      />
    )
    expect(
      screen.getByText("Answer.[[2]](<https://b.example>)")
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "来源 · 1" }))
    const links = within(screen.getByRole("list")).getAllByRole("link")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveTextContent("[2]Source B")
    expect(links[0]).toHaveAttribute("href", "https://b.example")
  })

  it("discards Google search suggestions and renders untitled URLs safely", async () => {
    render(
      <MessageBody
        role="assistant"
        parts={[]}
        metadata={{
          googleGrounding: {
            searchEntryPoint: {
              renderedContent:
                "<a href='https://google.com/search?q=test'>Google suggestions</a><style>body{display:none}</style>",
            },
            groundingChunks: [
              { web: { uri: "https://example.com/no-title", title: " " } },
            ],
          },
        }}
      />
    )
    expect(screen.queryByText("Google suggestions")).not.toBeInTheDocument()
    expect(document.querySelector("style")).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: "来源 · 1" }))
    expect(screen.getByRole("link")).toHaveTextContent(
      "https://example.com/no-title"
    )
  })

  it("starts collapsed with at most five stacked favicons and toggles the source list with the keyboard", async () => {
    render(
      <MessageBody
        role="assistant"
        parts={Array.from({ length: 6 }, (_, i) => ({
          type: "source-url",
          sourceId: String(i),
          url: `https://example${i}.com`,
          title: `Source ${i}`,
        }))}
      />
    )
    const trigger = screen.getByRole("button", { name: "来源 · 6" })
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(trigger.querySelectorAll('[data-slot="avatar"]')).toHaveLength(5)
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(within(screen.getByRole("list")).getAllByRole("link")).toHaveLength(
      6
    )
    await userEvent.keyboard(" ")
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })
})
