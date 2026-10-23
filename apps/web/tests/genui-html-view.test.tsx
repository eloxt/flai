import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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
afterEach(cleanup)
afterAll(() => vi.unstubAllGlobals())

describe("HtmlView", () => {
  const code = `root = Stack([HtmlView("<p id='x'>hi</p><script>document.getElementById('x').textContent='ran'</script>", null, "Demo")])`

  it("runs in a sandboxed, offline frame only after Run is pressed", () => {
    const { container } = render(<GenuiBlock code={code} streaming={false} />, {
      wrapper: ThemeProvider,
    })
    expect(container.querySelector("iframe")).toBeNull()
    fireEvent.click(
      screen.getByRole("button", { name: "components.genui.run" })
    )
    const frame = container.querySelector("iframe")!
    expect(frame).toHaveAttribute("sandbox", "allow-scripts")
    expect(frame).toHaveAttribute("title", "Demo")
    const doc = frame.getAttribute("srcdoc")!
    // The policy precedes the model's markup and blocks every network request.
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(
      doc.indexOf("<p id='x'>")
    )
    expect(doc).toContain("default-src 'none'")
    expect(doc).toContain("connect-src 'none'")
    expect(doc).not.toContain("https://")
    fireEvent.click(
      screen.getByRole("button", { name: "components.genui.stop" })
    )
    expect(container.querySelector("iframe")).toBeNull()
  })

  it("cannot run while streaming", () => {
    render(<GenuiBlock code={code} streaming />, { wrapper: ThemeProvider })
    expect(
      screen.getByRole("button", { name: "components.genui.run" })
    ).toBeDisabled()
  })
})
