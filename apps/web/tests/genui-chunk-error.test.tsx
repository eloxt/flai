import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MessageBody } from "~/features/chat/components/message-body"

// Simulates a chunk from a previous deployment that no longer exists on the server.
vi.mock("~/components/genui/genui-block", () => {
  throw new Error("Failed to fetch dynamically imported module")
})
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("~/components/markdown", () => ({
  Markdown: ({ children }: { children: string }) => <p>{children}</p>,
}))

afterEach(cleanup)

describe("lazy Generative UI renderer", () => {
  it("falls back to the program source when its chunk fails to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      <MessageBody
        role="assistant"
        parts={[{ type: "text", text: 'Before\n\n```openui-lang\nroot = Stack([TextContent("Hi")])\n```\n\nAfter' }]}
      />
    )
    // The Suspense fallback shows the same source, so wait for the import to reject first.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(screen.getByText('root = Stack([TextContent("Hi")])')).toBeVisible()
    expect(screen.getByText("Before")).toBeVisible()
    expect(screen.getByText("After")).toBeVisible()
  })
})
