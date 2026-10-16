import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createInstance } from "i18next"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WebSearchSettings } from "~/components/admin/system-settings"
import { api } from "~/lib/api"
import translation from "../public/locales/en/translation.json"

const mocks = vi.hoisted(() => ({ load: vi.fn(), error: vi.fn(), success: vi.fn() }))
vi.mock("~/lib/api", () => ({ api: vi.fn() }))
vi.mock("~/lib/notify", () => ({ notify: { error: mocks.error, success: mocks.success } }))
vi.mock("~/store/model-store", () => ({ useModelStore: { getState: () => ({ load: mocks.load }) } }))

const i18n = createInstance()
await i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation } }, interpolation: { escapeValue: false } })
beforeEach(() => { vi.resetAllMocks(); mocks.load.mockResolvedValue([]) })
afterEach(cleanup)

describe("admin web search settings", () => {
  it("switches providers, preserves a masked key, and refreshes model capabilities after saving", async () => {
    vi.mocked(api).mockResolvedValueOnce({ provider: "native", exaApiKey: "exa-****-key" })
      .mockResolvedValueOnce({ provider: "exa", exaApiKey: "exa-****-key" })
    render(<I18nextProvider i18n={i18n}><WebSearchSettings /></I18nextProvider>)
    const key = await screen.findByLabelText("Exa API Key")
    expect(key).toHaveAttribute("type", "password")
    expect(key).toHaveValue("exa-****-key")
    fireEvent.click(screen.getByRole("button", { name: "Exa" }))
    expect(key).toBeRequired()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce())
    expect(api).toHaveBeenLastCalledWith("/admin/settings/web_search", { method: "PUT", body: { provider: "exa", exaApiKey: "exa-****-key" } })
  })

  it("keeps a replacement key editable when saving fails and does not refresh models", async () => {
    const failure = new Error("Offline")
    vi.mocked(api).mockResolvedValueOnce({ provider: "exa", exaApiKey: "exa-****-key" }).mockRejectedValueOnce(failure)
    render(<I18nextProvider i18n={i18n}><WebSearchSettings /></I18nextProvider>)
    const key = await screen.findByLabelText("Exa API Key")
    fireEvent.change(key, { target: { value: "replacement-key" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(failure))
    expect(key).toHaveValue("replacement-key")
    expect(key).toBeEnabled()
    expect(mocks.load).not.toHaveBeenCalled()
  })
})
