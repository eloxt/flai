import type { FlaiPart, MessageRecord } from "@flai/shared"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ConversationNav } from "~/features/chat/components/conversation-nav"
import { useChatStore } from "~/features/chat/chat-store"

const scroller = vi.hoisted(() => ({
  scrollToMessage: vi.fn(),
  visibility: {
    currentAnchorId: undefined as string | undefined,
    visibleMessageIds: [] as string[],
  },
}))

// An uninitialised i18n instance makes useTranslation suspend, which renders nothing without a boundary.
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("~/components/ui/message-scroller", () => ({
  useMessageScroller: () => ({ scrollToMessage: scroller.scrollToMessage }),
  useMessageScrollerVisibility: () => scroller.visibility,
}))

const text = (value: string): FlaiPart => ({ type: "text", text: value })
const file: FlaiPart = {
  type: "file",
  mediaType: "image/png",
  url: "https://example.com/a.png",
}

function message(
  id: string,
  role: "user" | "assistant",
  parts: FlaiPart[],
  parentId: string | null
): MessageRecord {
  return {
    id,
    parentId,
    role,
    parts,
    metadata: {},
    createdAt: "2026-01-01T00:00:00Z",
  }
}

/** Load a linear conversation into the chat store. */
function load(...messages: MessageRecord[]) {
  act(() => {
    useChatStore.setState({
      map: Object.fromEntries(messages.map((m) => [m.id, m])),
      path: messages.map((m) => m.id),
      streaming: null,
    })
  })
}

const twoTurns = () => [
  message("u1", "user", [text("first question")], null),
  message(
    "a1",
    "assistant",
    [text("first answer\n```openui-lang\nroot = Stack()\n```\nafter the UI")],
    "u1"
  ),
  message("u2", "user", [file], "a1"),
  message("a2", "assistant", [text("second answer")], "u2"),
]

describe("ConversationNav", () => {
  beforeEach(() => {
    scroller.scrollToMessage.mockClear()
    scroller.visibility = { currentAnchorId: undefined, visibleMessageIds: [] }
  })
  afterEach(() => {
    cleanup()
    act(() => {
      useChatStore.setState({ map: {}, path: [], streaming: null })
    })
  })

  it("renders nothing for a single turn", () => {
    load(...twoTurns().slice(0, 2))
    const { container } = render(<ConversationNav />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders one tick per user turn, falling back to a label for attachment-only prompts", () => {
    load(...twoTurns())
    render(<ConversationNav />)
    const ticks = screen.getAllByRole("button")
    expect(ticks).toHaveLength(2)
    expect(ticks[0]).toHaveAccessibleName("first question")
    expect(ticks[1]).toHaveAccessibleName("pages.chat.navAttachmentOnly")
  })

  it("marks the reading position and scrolls to a turn on click", () => {
    scroller.visibility = {
      currentAnchorId: "u2",
      visibleMessageIds: ["u2", "a2"],
    }
    load(...twoTurns())
    render(<ConversationNav />)
    const [first, second] = screen.getAllByRole("button")
    expect(second).toHaveAttribute("aria-current", "true")
    expect(first).not.toHaveAttribute("aria-current")

    fireEvent.click(first)
    expect(scroller.scrollToMessage).toHaveBeenCalledWith("u1", {
      align: "start",
      behavior: "smooth",
    })
  })

  it("shows a preview of the answer without code fences for the focused tick", () => {
    load(...twoTurns())
    const { container } = render(<ConversationNav />)
    expect(container.querySelector("p")).toBeNull()

    fireEvent.focus(screen.getAllByRole("button")[0])
    expect(screen.getByText("first answer after the UI")).toBeInTheDocument()

    fireEvent.blur(screen.getAllByRole("button")[0])
    expect(container.querySelector("p")).toBeNull()
  })

  it("lays ticks out on the right edge", () => {
    load(...twoTurns())
    render(<ConversationNav />)
    expect(screen.getByRole("navigation", { hidden: true })).toHaveClass(
      "right-3"
    )
  })
})
