import { modelConfigSchema, type PublicProvider } from "@flai/shared"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ChatInput } from "~/components/chat-input"
import { api } from "~/lib/api"
import { useInputStore } from "~/store/input-store"
import { useModelStore } from "~/store/model-store"

vi.mock("~/lib/api", () => ({ api: vi.fn() }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const nativeModel = modelConfigSchema.parse({ id: "m", toolCall: true, internalTools: ["web_search", "url_context"], thinkingLevels: ["low"] })
const provider: PublicProvider = { id: "p", name: "P", type: "gemini", logo: null, models: [nativeModel] }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api).mockResolvedValue([{ id: "s", name: "External", isActive: true, tools: [{ name: "lookup" }] }])
  useInputStore.setState({ builtinTools: ["webSearch", "urlContext"], mcpTools: [], thinking: null })
  useModelStore.setState({ providers: [{ ...provider, models: [{ ...nativeModel, internalTools: [] }] }], selected: { providerId: "p", modelId: "m" }, loaded: true })
})
afterEach(cleanup)

describe("chat input web tools", () => {
  it("hides search and URL context in Exa mode while keeping MCP and thinking controls", async () => {
    render(<ChatInput draftKey="new" onSubmit={() => true} />)
    expect(screen.queryByRole("button", { name: "common.search" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "common.urlContext" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "components.chatInput.thinking.low" })).toBeVisible()
    expect(await screen.findByRole("button", { name: "components.chatInput.mcpTools" })).toBeVisible()
  })

  it("restores native toggles and saved selections after switching back", () => {
    render(<ChatInput draftKey="new" onSubmit={() => true} />)
    act(() => useModelStore.setState({ providers: [provider] }))
    expect(screen.getByRole("button", { name: "common.search" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "common.urlContext" })).toHaveAttribute("aria-pressed", "true")
    expect(useInputStore.getState().builtinTools).toEqual(["webSearch", "urlContext"])
  })
})
