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
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { GenuiBlock } from "~/components/genui/genui-block"
import { ThemeProvider } from "~/components/theme-provider"
import { ImageSearchContext } from "~/hooks/use-image-search"
import { ImageProxyContext } from "~/hooks/use-proxied-images"
import { api, apiFetch } from "~/lib/api"

vi.mock("~/lib/api", () => ({ api: vi.fn(), apiFetch: vi.fn() }))
const searchMock = vi.mocked(api)
const fetchMock = vi.mocked(apiFetch)
const broken = "https://upload.wikimedia.org/broken.jpg"
const photo = "https://upload.wikimedia.org/photo.jpg"

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
beforeEach(() => {
  vi.clearAllMocks()
  let sequence = 0
  URL.createObjectURL = vi.fn(() => `blob:proxy-${++sequence}`)
  URL.revokeObjectURL = vi.fn()
  searchMock.mockResolvedValue({ images: [broken, photo] })
  fetchMock.mockImplementation(async (path) =>
    path.includes(encodeURIComponent(broken))
      ? Promise.reject(new Error("Image request failed"))
      : new Response("image", { headers: { "content-type": "image/jpeg" } })
  )
})
afterEach(cleanup)
afterAll(() => vi.unstubAllGlobals())

describe("SearchImage", () => {
  it("searches once the query settles and shows the first photo the proxy can load", async () => {
    const { container } = render(
      <GenuiBlock
        code={`root = Stack([SearchImage("Belém Tower Lisbon", 1)])`}
        streaming={false}
      />,
      { wrapper: ThemeProvider }
    )
    const image = await screen.findByAltText(
      "Belém Tower Lisbon",
      {},
      { timeout: 2000 }
    )
    expect(image).toHaveAttribute("src", "blob:proxy-1")
    expect(searchMock).toHaveBeenCalledWith("/images/search", {
      auth: true,
      query: { q: "Belém Tower Lisbon" },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `/images/proxy?url=${encodeURIComponent(photo)}`,
      expect.objectContaining({ auth: true })
    )
    expect(container.querySelectorAll('img[src^="https://"]')).toHaveLength(0)
  })

  it("uses the public share endpoints without credentials", async () => {
    render(
      <ImageProxyContext value="/public/shares/s1/images">
        <ImageSearchContext value="/public/shares/s1/image-search">
          <GenuiBlock
            code={`root = Stack([SearchImage("Pena Palace Sintra")])`}
            streaming={false}
          />
        </ImageSearchContext>
      </ImageProxyContext>,
      { wrapper: ThemeProvider }
    )
    await screen.findByAltText("Pena Palace Sintra", {}, { timeout: 2000 })
    expect(searchMock).toHaveBeenCalledWith("/public/shares/s1/image-search", {
      auth: false,
      query: { q: "Pena Palace Sintra" },
    })
    expect(
      fetchMock.mock.calls.every(
        ([path, options]) =>
          path.startsWith("/public/shares/s1/images?") &&
          options?.auth === false
      )
    ).toBe(true)
  })

  it("shows a placeholder when nothing is found", async () => {
    searchMock.mockResolvedValue({ images: [] })
    render(
      <GenuiBlock
        code={`root = Stack([SearchImage("nothing to find here")])`}
        streaming={false}
      />,
      {
        wrapper: ThemeProvider,
      }
    )
    await waitFor(
      () =>
        expect(
          screen.getByRole("img", { name: "nothing to find here" })
        ).toBeInTheDocument(),
      { timeout: 2000 }
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

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
