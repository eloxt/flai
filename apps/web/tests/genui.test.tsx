import { buildGenuiPrompt } from "@flai/shared/genui"
import { genuiFunctions } from "@flai/shared/genui/functions"
import spec from "../../../packages/shared/src/genui/openui.spec.json"
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui"
import { createParser } from "@openuidev/react-lang"
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
import { genuiExtension } from "~/components/genui/extensions"
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
  it("advertises a compact subset with official signatures and keeps the full renderer available", () => {
    const names = Object.keys(spec.library.components)
    const extended = openuiLibrary.extend(genuiExtension)
    const curated = extended.extend({
      components: { remove: Object.keys(extended.components).filter((name) => !names.includes(name)) },
    })
    expect(names).toHaveLength(44)
    expect(Object.keys(spec.library.functions)).toEqual(genuiFunctions.map((fn) => fn.name))
    expect(spec.library).toEqual({ ...curated.toSpec(), componentGroups: spec.library.componentGroups })
    expect(spec.promptOptions.examples).toEqual(openuiPromptOptions.examples?.slice(0, 4))
    const parser = createParser(curated.toJSONSchema(), curated.root)
    for (const example of spec.promptOptions.examples) {
      const parsed = parser.parse(example.slice(example.indexOf("root = ")))
      expect(parsed.root).not.toBeNull()
      expect(parsed.meta.errors).toEqual([])
      expect(parsed.meta.unresolved).toEqual([])
    }
    expect(openuiLibrary.components).toHaveProperty("VisualCardBlock")
    const prompt = buildGenuiPrompt()
    for (const component of Object.values(spec.library.components)) {
      expect(prompt).toContain(component.signature)
    }
    for (const fn of Object.values(spec.library.functions)) {
      expect(prompt).toContain(fn.signature)
    }
    expect(prompt).toContain("tagged `openui-lang`")
    expect(prompt).toContain("complete, standalone program")
    expect(prompt).not.toContain(
      "Your ENTIRE response must be valid openui-lang"
    )
    expect(prompt).not.toContain("generate realistic/plausible data")
    for (const name of ["VisualCardBlock", "CompositeCardBlock", "EditableTable", "RadarChart", "Modal"]) {
      expect(prompt).not.toContain(name)
    }
    expect(prompt.length).toBeLessThan(26_000)
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
