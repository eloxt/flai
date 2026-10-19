import { modelConfigSchema, type PublicProvider } from "@flai/shared"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ModelSelector } from "~/components/model-selector"
import { api } from "~/lib/api"
import { useInputStore } from "~/store/input-store"
import { useModelStore } from "~/store/model-store"

vi.mock("~/lib/api", () => ({ api: vi.fn() }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const model = (id: string, internalTools: string[]) => modelConfigSchema.parse({ id, name: id, toolCall: true, internalTools })
const provider: PublicProvider = {
  id: "p", name: "P", type: "gemini", logo: null,
  models: [model("plain", []), model("search", ["web_search"]), model("gemini", ["web_search", "url_context"])],
}

async function switchTo(name: string) {
  await userEvent.click(screen.getByRole("button", { name: /plain|search|gemini/ }))
  await userEvent.click(await screen.findByRole("menuitemradio", { name }))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api).mockResolvedValue([provider])
  useModelStore.setState({ providers: [provider], selected: { providerId: "p", modelId: "plain" }, loaded: true })
  useInputStore.setState({ builtinTools: [], mcpTools: [] })
})
afterEach(cleanup)

describe("switching models", () => {
  it("turns on every built-in tool the new model offers", async () => {
    render(<ModelSelector />)
    await switchTo("gemini")
    expect(useInputStore.getState().builtinTools).toEqual(["webSearch", "urlContext"])
  })

  it("turns them on again after the user switched them off on another model", async () => {
    useModelStore.setState({ selected: { providerId: "p", modelId: "gemini" } })
    render(<ModelSelector />)
    await switchTo("search")
    expect(useInputStore.getState().builtinTools).toEqual(["webSearch"])
  })

  it("leaves tools alone for models without them, and keeps MCP tools the user picked", async () => {
    useInputStore.setState({ builtinTools: [], mcpTools: [{ serverId: "s", name: "lookup" }] })
    render(<ModelSelector />)
    await switchTo("gemini")
    expect(useInputStore.getState().builtinTools).toEqual([])
    expect(useInputStore.getState().mcpTools).toEqual([{ serverId: "s", name: "lookup" }])
    cleanup()
    useInputStore.setState({ mcpTools: [] })
    render(<ModelSelector />)
    await switchTo("plain")
    expect(useInputStore.getState().builtinTools).toEqual([])
  })
})
