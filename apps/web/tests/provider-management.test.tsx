import type { AdminProvider } from "@flai/shared"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { createInstance } from "i18next"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProviderManagement } from "~/components/admin/provider-management"
import { api } from "~/lib/api"
import translation from "../public/locales/en/translation.json"

const { load, error } = vi.hoisted(() => ({ load: vi.fn(), error: vi.fn() }))
vi.mock("~/lib/api", () => ({ api: vi.fn() }))
vi.mock("~/lib/notify", () => ({ notify: { error } }))
vi.mock("~/store/model-store", () => ({
  useModelStore: { getState: () => ({ load }) },
}))

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: "en",
  resources: { en: { translation } },
  interpolation: { escapeValue: false },
})

const providers: AdminProvider[] = ["Alpha", "Beta", "Gamma"].map((name) => ({
  id: name.toLowerCase(),
  name,
  type: "openai",
  apiKey: "****",
  baseUrl: null,
  logo: null,
  isActive: true,
  models: [],
  createdAt: "2026-10-16T00:00:00Z",
  updatedAt: "2026-10-16T00:00:00Z",
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api).mockResolvedValue(providers)
  load.mockResolvedValue([])
})
afterEach(cleanup)

describe("provider ordering", () => {
  it("saves moves in both directions and refreshes the model selector", async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ProviderManagement />
      </I18nextProvider>
    )
    const up = await screen.findByRole("button", { name: "Move Alpha up" })
    expect(up).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "Move Gamma down" })
    ).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "Move Beta up" }))
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Move Beta up" })
      ).toBeDisabled()
    )
    expect(api).toHaveBeenCalledWith("/admin/providers/order", {
      method: "PUT",
      body: { ids: ["beta", "alpha", "gamma"] },
    })
    expect(
      within(screen.getAllByRole("row")[1]!).getByText("Beta")
    ).toBeVisible()
    expect(load).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Move Alpha down" }))
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Move Alpha down" })
      ).toBeDisabled()
    )
    expect(api).toHaveBeenLastCalledWith("/admin/providers/order", {
      method: "PUT",
      body: { ids: ["beta", "gamma", "alpha"] },
    })
    expect(
      within(screen.getAllByRole("row")[3]!).getByText("Alpha")
    ).toBeVisible()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("blocks conflicting changes while saving and keeps the old order on failure", async () => {
    let rejectSave!: (reason: Error) => void
    vi.mocked(api)
      .mockResolvedValueOnce(providers)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSave = reject
          })
      )
    render(
      <I18nextProvider i18n={i18n}>
        <ProviderManagement />
      </I18nextProvider>
    )
    fireEvent.click(await screen.findByRole("button", { name: "Move Beta up" }))
    expect(
      screen.getByRole("button", { name: "Move Alpha down" })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "Create Provider" })
    ).toBeDisabled()
    expect(screen.getAllByRole("button", { name: "Edit" })[0]).toBeDisabled()
    const failure = new Error("Offline")
    await act(async () => rejectSave(failure))
    expect(error).toHaveBeenCalledWith(failure)
    expect(
      within(screen.getAllByRole("row")[1]!).getByText("Alpha")
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Move Beta up" })).toBeEnabled()
    expect(load).not.toHaveBeenCalled()
  })
})
