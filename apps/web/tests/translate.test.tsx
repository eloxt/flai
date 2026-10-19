import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import TranslatePage from "~/pages/translate"
import { apiFetch } from "~/lib/api"
import { notify } from "~/lib/notify"
import { uploadFile } from "~/lib/upload"
import { useModelStore } from "~/store/model-store"
import { useTranslateStore } from "~/store/translate-store"

vi.mock("~/i18n", async () => {
  const { createInstance } = await import("i18next")
  const { initReactI18next } = await import("react-i18next")
  const { default: translation } =
    await import("../public/locales/en/translation.json")
  const i18n = createInstance()
  await i18n.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation } },
    interpolation: { escapeValue: false },
  })
  return { default: i18n }
})
vi.mock("~/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/api")>()),
  apiFetch: vi.fn(),
}))
vi.mock("~/lib/upload", () => ({
  uploadFile: vi.fn(async (file: File) => ({
    id: file.name,
    name: file.name,
    mediaType: file.type,
    size: file.size,
    url: `https://cdn/${file.name}`,
    createdAt: "",
  })),
}))
vi.mock("~/lib/notify", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}))

const writeText = vi.fn().mockResolvedValue(undefined)
beforeEach(() => {
  vi.clearAllMocks()
  useModelStore.setState({ selected: { providerId: "p", modelId: "m" } })
  useTranslateStore.setState({
    source: "Chinese",
    target: "English",
    instruction: "",
  })
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
})
afterEach(cleanup)

describe("translation workspace", () => {
  it("sends style requirements, displays the streamed result, and copies the edited translation", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(
        'data: {"type":"text-delta","id":"t","delta":"Hello"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\n'
      )
    )
    render(<TranslatePage />)
    expect(
      screen.getByRole("button", { name: "Copy translation" })
    ).toBeDisabled()
    fireEvent.change(screen.getByRole("textbox", { name: "Original" }), {
      target: { value: "你好" },
    })
    fireEvent.change(
      screen.getByRole("textbox", { name: "Style requirements" }),
      { target: { value: "Formal" } }
    )
    fireEvent.click(screen.getByRole("button", { name: "Translate" }))
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Translation" })).toHaveValue(
        "Hello"
      )
    )
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Copy translation" })
      ).toBeEnabled()
    )
    expect(apiFetch).toHaveBeenCalledWith(
      "/translate",
      expect.objectContaining({
        body: {
          model: { providerId: "p", modelId: "m" },
          source: "Chinese",
          target: "English",
          text: "你好",
          imageFileIds: [],
          instruction: "Formal",
        },
      })
    )
    fireEvent.change(screen.getByRole("textbox", { name: "Translation" }), {
      target: { value: "Hello there" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Copy translation" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Hello there"))
    expect(notify.success).toHaveBeenCalledWith("Translation copied")
  })

  it("swaps both languages and text", () => {
    render(<TranslatePage />)
    fireEvent.change(screen.getByRole("textbox", { name: "Original" }), {
      target: { value: "你好" },
    })
    fireEvent.change(screen.getByRole("textbox", { name: "Translation" }), {
      target: { value: "Hello" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Swap languages and text" })
    )
    expect(useTranslateStore.getState()).toMatchObject({
      source: "English",
      target: "Chinese",
    })
    expect(screen.getByRole("textbox", { name: "Original" })).toHaveValue(
      "Hello"
    )
    expect(screen.getByRole("textbox", { name: "Translation" })).toHaveValue(
      "你好"
    )
  })

  it("locks conflicting controls while streaming and preserves partial output on stop", async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        stream = controller
      },
    })
    vi.mocked(apiFetch).mockResolvedValue(new Response(body))
    render(<TranslatePage />)
    const source = screen.getByRole("textbox", { name: "Original" })
    fireEvent.change(source, { target: { value: "你好" } })
    fireEvent.keyDown(source, { key: "Enter", ctrlKey: true })
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled()
    )
    expect(
      screen.getByRole("combobox", { name: "Source language" })
    ).toBeDisabled()
    expect(
      screen.getByRole("combobox", { name: "Target language" })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "Swap languages and text" })
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "Add image" })).toBeDisabled()
    expect(
      screen.getByRole("textbox", { name: "Translation" })
    ).toHaveAttribute("readonly")
    await act(async () => {
      stream.enqueue(
        new TextEncoder().encode(
          'data: {"type":"text-delta","id":"t","delta":"Hel"}\n\n'
        )
      )
    })
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Translation" })).toHaveValue(
        "Hel"
      )
    )
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(vi.mocked(apiFetch).mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(
      screen.getByRole("textbox", { name: "Translation" })
    ).not.toHaveAttribute("readonly")
    expect(screen.getByRole("textbox", { name: "Translation" })).toHaveValue(
      "Hel"
    )
    await act(async () => {
      stream.close()
    })
    expect(notify.error).not.toHaveBeenCalled()
  })

  it("uploads no more images than the limit when many are picked at once", async () => {
    const { container } = render(<TranslatePage />)
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!
    const files = Array.from(
      { length: 7 },
      (_, i) => new File(["x"], `${i}.png`, { type: "image/png" })
    )
    fireEvent.change(input, { target: { files } })
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(5))
    expect(notify.error).toHaveBeenCalledWith("You can add up to 5 images")
  })
})
