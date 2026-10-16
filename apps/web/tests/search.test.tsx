import type { SearchHit } from "@flai/shared"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { createInstance } from "i18next"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import translation from "../public/locales/en/translation.json"
import { api } from "~/lib/api"
import SearchPage from "~/pages/search"

vi.mock("~/lib/api", () => ({ api: vi.fn() }))

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: "en",
  resources: { en: { translation } },
  interpolation: { escapeValue: false },
})

const hit: SearchHit = {
  conversationId: "conversation-1",
  messageId: "message-1",
  title: "Design notes",
  icon: null,
  createdAt: "2026-10-15T00:00:00Z",
  highlight: "A <em>Swiss</em> layout <img src=x onerror=alert(1)>",
}

beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

describe("search page", () => {
  it("submits a trimmed query to the URL, highlights plain text safely, and opens a conversation", async () => {
    vi.mocked(api).mockResolvedValue([hit])
    const router = createMemoryRouter(
      [
        { path: "/search", element: <SearchPage /> },
        { path: "/chat/:conversationId", element: <p>Conversation opened</p> },
      ],
      { initialEntries: ["/search"] }
    )
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    )

    expect(api).not.toHaveBeenCalled()
    expect(screen.getByText("Pick up where you left off")).toBeVisible()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "  Swiss  " },
    })
    fireEvent.submit(screen.getByRole("search"))

    await screen.findByRole("link", { name: /Design notes/ })
    expect(router.state.location.search).toBe("?q=Swiss")
    expect(api).toHaveBeenCalledWith(
      "/search",
      expect.objectContaining({ query: { q: "Swiss" } })
    )
    expect(screen.getByText("1 conversation found")).toBeVisible()
    expect(container.querySelector("mark")).toHaveTextContent("Swiss")
    expect(container.querySelector("img")).toBeNull()

    fireEvent.click(screen.getByRole("link", { name: /Design notes/ }))
    await screen.findByText("Conversation opened")
    expect(router.state.location.pathname).toBe("/chat/conversation-1")
  })

  it("restores the URL query on entry and browser back, and ignores an outdated request", async () => {
    let resolveOld!: (hits: SearchHit[]) => void
    vi.mocked(api)
      .mockImplementationOnce(
        () =>
          new Promise<SearchHit[]>((resolve) => {
            resolveOld = resolve
          })
      )
      .mockResolvedValueOnce([hit])
      .mockResolvedValueOnce([])
    const router = createMemoryRouter(
      [{ path: "/search", element: <SearchPage /> }],
      { initialEntries: ["/search?q=old"] }
    )
    render(
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    )
    expect(screen.getByRole("searchbox")).toHaveValue("old")
    const oldSignal = vi.mocked(api).mock.calls[0]?.[1]?.signal

    await act(async () => {
      await router.navigate("/search?q=Swiss")
    })
    await screen.findByRole("link", { name: /Design notes/ })
    expect(oldSignal?.aborted).toBe(true)
    await act(async () => {
      resolveOld([{ ...hit, title: "Stale result" }])
    })
    expect(screen.queryByText("Stale result")).not.toBeInTheDocument()

    await act(async () => {
      await router.navigate(-1)
    })
    expect(screen.getByRole("searchbox")).toHaveValue("old")
    await screen.findByText("No results found")
  })

  it("keeps request errors distinct from empty results and retries the same query", async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce([])
    const router = createMemoryRouter(
      [{ path: "/search", element: <SearchPage /> }],
      { initialEntries: ["/search?q=Swiss"] }
    )
    render(
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    )

    fireEvent.click(await screen.findByRole("button", { name: "Try Again" }))
    await screen.findByText("No results found")
    expect(api).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByText("Check your connection and try again.")
    ).not.toBeInTheDocument()
    expect(screen.getByText("0 conversations found")).toBeVisible()
  })

  it("ignores blank queries and does not submit Enter while composing Chinese text", async () => {
    const router = createMemoryRouter(
      [{ path: "/search", element: <SearchPage /> }],
      { initialEntries: ["/search"] }
    )
    render(
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    )
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "   " },
    })
    fireEvent.submit(screen.getByRole("search"))
    await waitFor(() => expect(router.state.location.search).toBe(""))
    expect(api).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "设计" },
    })
    expect(
      fireEvent.keyDown(screen.getByRole("searchbox"), {
        key: "Enter",
        isComposing: true,
      })
    ).toBe(false)
    expect(api).not.toHaveBeenCalled()
  })
})
