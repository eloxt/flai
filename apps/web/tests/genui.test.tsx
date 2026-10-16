import { buildGenuiPrompt } from "@flai/shared/genui"
import spec from "../../../packages/shared/src/genui/openui.spec.json"
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { GenuiBlock } from "~/components/genui/genui-block"
import { ThemeProvider } from "~/components/theme-provider"

beforeAll(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

afterAll(() => vi.unstubAllGlobals())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.classList.remove("dark")
})

describe("official OpenUI library", () => {
  it("keeps the server specification in sync with the renderer and uses chat instructions", () => {
    expect(spec).toEqual({
      library: openuiLibrary.toSpec(),
      promptOptions: openuiPromptOptions,
    })
    const prompt = buildGenuiPrompt()
    for (const component of Object.values(spec.library.components)) {
      expect(prompt).toContain(component.signature)
    }
    expect(prompt).toContain("tagged `openui-lang`")
    expect(prompt).toContain("complete, standalone program")
    expect(prompt).not.toContain(
      "Your ENTIRE response must be valid openui-lang"
    )
    expect(prompt).not.toContain("generate realistic/plausible data")
  })

  it("renders official card and column-oriented table signatures", () => {
    render(
      <GenuiBlock
        code={`root = Stack([card])
card = Card([CardHeader("Usage"), table])
table = Table([Col("Model", ["GPT"]), Col("Requests", [42])])`}
        streaming={false}
      />,
      { wrapper: ThemeProvider }
    )
    expect(screen.getByText("Usage")).toBeInTheDocument()
    expect(
      screen.getByRole("columnheader", { name: "Model" })
    ).toBeInTheDocument()
    expect(screen.getByRole("cell", { name: "GPT" })).toBeInTheDocument()
    expect(screen.getByRole("cell", { name: "42" })).toBeInTheDocument()
  })

  it("sends button messages and action context back to the conversation", async () => {
    const onSend = vi.fn()
    render(
      <GenuiBlock
        code={`root = Stack([Buttons([Button("Continue", @ToAssistant("Show details", {id: 42}))])])`}
        streaming={false}
        onSend={onSend}
      />,
      { wrapper: ThemeProvider }
    )
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('Show details\n\nContext: {"id":42}')
    )
  })

  it("disables actions while streaming", () => {
    const onSend = vi.fn()
    render(
      <GenuiBlock
        code={`root = Stack([Buttons([Button("Continue")])])`}
        streaming
        onSend={onSend}
      />,
      { wrapper: ThemeProvider }
    )
    const button = screen.getByRole("button", { name: "Continue" })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onSend).not.toHaveBeenCalled()
  })

  it("includes official form field values when submitting", async () => {
    const onSend = vi.fn()
    render(
      <GenuiBlock
        code={`root = Stack([form])
form = Form("contact", Buttons([Button("Send", @ToAssistant("Save contact"))]), [FormControl("Name", Input("name", "Your name"))])`}
        streaming={false}
        onSend={onSend}
      />,
      { wrapper: ThemeProvider }
    )
    fireEvent.change(screen.getByPlaceholderText("Your name"), {
      target: { value: "Alex" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.stringContaining("contact.name: Alex")
      )
    )
    expect(onSend.mock.calls[0]?.[0]).toContain("Save contact")
  })

  it("opens HTTP links through the existing action handler", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    render(
      <GenuiBlock
        code={`root = Stack([Buttons([Button("Docs", @OpenUrl("https://www.openui.com/docs"))])])`}
        streaming={false}
      />,
      { wrapper: ThemeProvider }
    )
    fireEvent.click(screen.getByRole("button", { name: "Docs" }))
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://www.openui.com/docs",
        "_blank",
        "noopener,noreferrer"
      )
    )
  })

  it("applies the app's saved dark theme to OpenUI", () => {
    localStorage.setItem("flai-theme", "dark")
    render(
      <ThemeProvider>
        <GenuiBlock
          code={`root = Stack([TextContent("Dark mode")])`}
          streaming={false}
        />
      </ThemeProvider>
    )
    expect(screen.getByText("Dark mode")).toBeInTheDocument()
    expect(document.documentElement).toHaveClass("dark")
    expect(
      document.head.querySelector("[data-openui-theme]")?.textContent
    ).toContain("--openui-background: var(--background)")
  })
})
