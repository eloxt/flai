import type { Conversation } from "@flai/shared"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createInstance } from "i18next"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import translation from "../public/locales/en/translation.json"
import { AppSidebar } from "~/components/sidebar/app-sidebar"
import { ThemeProvider } from "~/components/theme-provider"
import { SidebarProvider } from "~/components/ui/sidebar"
import { api } from "~/lib/api"
import { useConversationStore } from "~/store/conversation-store"

vi.mock("~/lib/api", () => ({ api: vi.fn() }))

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
})) as never

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: "en",
  resources: { en: { translation } },
  interpolation: { escapeValue: false },
})

const conversation: Conversation = {
  id: "conversation-1",
  title: "Old title",
  icon: null,
  favourite: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as Conversation

function renderSidebar() {
  const router = createMemoryRouter([{ path: "/", element: <AppSidebar /> }], { initialEntries: ["/"] })
  render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <SidebarProvider>
          <RouterProvider router={router} />
        </SidebarProvider>
      </ThemeProvider>
    </I18nextProvider>
  )
}

async function startRename() {
  fireEvent.click(screen.getByRole("button", { name: "More actions" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }))
  const input = await screen.findByRole("textbox", { name: "Rename" })
  await waitFor(() => expect(input).toHaveFocus())
  return input
}

beforeEach(() => {
  vi.resetAllMocks()
  useConversationStore.setState({ conversations: [conversation], favourites: [], loaded: true, nextCursor: null })
})
afterEach(cleanup)

describe("sidebar rename", () => {
  it("saves a trimmed title on Enter", async () => {
    vi.mocked(api).mockResolvedValue({ ...conversation, title: "New title" })
    renderSidebar()
    const input = await startRename()
    fireEvent.change(input, { target: { value: "  New title  " } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(await screen.findByText("New title")).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith("/conversations/conversation-1", { method: "PATCH", body: { title: "New title" } })
  })

  it("keeps the title on Escape or an empty value", async () => {
    renderSidebar()
    let input = await startRename()
    fireEvent.change(input, { target: { value: "Discarded" } })
    fireEvent.keyDown(input, { key: "Escape" })
    expect(await screen.findByText("Old title")).toBeInTheDocument()

    input = await startRename()
    fireEvent.change(input, { target: { value: "   " } })
    fireEvent.blur(input)
    expect(await screen.findByText("Old title")).toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()
  })
})
