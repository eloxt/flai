import { openuiLibrary } from "@openuidev/react-ui"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { GenuiBlock } from "~/components/genui/genui-block"
import { genuiExtension } from "~/components/genui/extensions"
import { imageLibrary } from "~/components/genui/image-library"
import { ThemeProvider } from "~/components/theme-provider"
import { ImageProxyContext } from "~/hooks/use-proxied-images"
import { apiFetch } from "~/lib/api"

vi.mock("~/lib/api", () => ({ apiFetch: vi.fn() }))
const fetchMock = vi.mocked(apiFetch)
const photo = "https://www.discoverhongkong.com/content/dam/dhk/intl/explore/great-outdoors/hiking-listicle/a-960x720.jpg"
const other = "https://images.example/other.jpg"

beforeAll(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
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
  fetchMock.mockImplementation(async () => new Response("image", { headers: { "content-type": "image/jpeg" } }))
})
afterEach(cleanup)
afterAll(() => vi.unstubAllGlobals())

describe("OpenUI image proxy", () => {
  it("keeps official schemas and prompt signatures intact", () => {
    expect(imageLibrary.toSpec()).toEqual(openuiLibrary.extend(genuiExtension).toSpec())
  })

  it("proxies VisualCardItem background images before applying any remote CSS URLs", async () => {
    const code = `root = VisualCardBlock([first, second])
first = VisualCardItem(BoldText("text", "Dragon's Back", null, "text", "sm"), "first", "${photo}", null, "Dragon's Back")
second = VisualCardItem(BoldText("text", "Other", null, "text", "sm"), "second", "${other}", null, "Other")`
    const { container, unmount } = render(<GenuiBlock code={code} streaming={false} />, { wrapper: ThemeProvider })
    expect(container.querySelectorAll('[style*="https://"]')).toHaveLength(0)
    await waitFor(() => expect(container.querySelectorAll('[style*="blob:proxy-"]')).toHaveLength(2))
    expect(screen.getByText("Dragon's Back")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(`/images/proxy?url=${encodeURIComponent(photo)}`, { auth: true, signal: expect.any(AbortSignal) })
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it("proxies MediaCard photos and ListBlock thumbnails", async () => {
    const code = `root = Stack([MediaCard("${photo}", "Dragon's Back", "Dragon's Back", "A ridge walk.", ["Hike", "3 h"], "horizontal"), ListBlock([ListItem("Other", "A second place", {src: "${other}", alt: "Other"})], "image")])`
    const { container } = render(<GenuiBlock code={code} streaming={false} />, { wrapper: ThemeProvider })
    expect(container.querySelectorAll('img[src^="https://"]')).toHaveLength(0)
    await waitFor(() => expect(container.querySelectorAll('img[src^="blob:"]')).toHaveLength(2))
    expect(screen.getByAltText("Dragon's Back")).toHaveAttribute("src", expect.stringMatching(/^blob:/))
    expect(screen.getByText("3 h")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("keeps direct image, gallery thumbnails and modal previews on blob URLs", async () => {
    const code = `root = Stack([Image("Single", "${photo}"), ImageBlock("${other}", "Block"), ImageGallery([{src: "${photo}", alt: "Gallery photo"}])])`
    const { container } = render(<GenuiBlock code={code} streaming={false} />, { wrapper: ThemeProvider })
    expect(container.querySelectorAll('img[src^="https://"]')).toHaveLength(0)
    await waitFor(() => expect(container.querySelectorAll('img[src^="blob:"]')).toHaveLength(3))
    fireEvent.click(screen.getByAltText("Gallery photo"))
    await screen.findByRole("dialog", { name: "All Photos" })
    expect(document.querySelectorAll('img[src^="https://"]')).toHaveLength(0)
    expect(screen.getAllByAltText("Gallery photo").every((image) => image.getAttribute("src")?.startsWith("blob:"))).toBe(true)
  })

  it("uses the public share proxy for CSS backgrounds and leaves external actions unchanged", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    const code = `root = Stack([ContextCardBlock([first, second]), Buttons([Button("Visit", @OpenUrl("${photo}"))])])
first = ContextCardItem("first", "First", null, null, "${photo}", "First")
second = ContextCardItem("second", "Second", null, null, "${other}", "Second")`
    const { container } = render(
      <ImageProxyContext value="/public/shares/test-share/images">
        <GenuiBlock code={code} streaming={false} />
      </ImageProxyContext>,
      { wrapper: ThemeProvider }
    )
    await waitFor(() => expect(container.querySelectorAll('[style*="blob:proxy-"]')).toHaveLength(2))
    expect(fetchMock.mock.calls.every(([path, options]) => path.startsWith("/public/shares/test-share/images?") && options?.auth === false)).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Visit" }))
    await waitFor(() => expect(open).toHaveBeenCalledWith(photo, "_blank", "noopener,noreferrer"))
    open.mockRestore()
  })

  it("sends original image URLs back to the model when a photo card is clicked", async () => {
    const onSend = vi.fn()
    const code = `root = ContextCardBlock([first, second], "grid", true, @ToAssistant("Describe selection"))
first = ContextCardItem("first", "First", null, null, "${photo}", "First")
second = ContextCardItem("second", "Second", null, null, "${other}", "Second")`
    const { container } = render(<GenuiBlock code={code} streaming={false} onSend={onSend} />, { wrapper: ThemeProvider })
    await waitFor(() => expect(container.querySelectorAll('[style*="blob:proxy-"]')).toHaveLength(2))
    fireEvent.click(screen.getByRole("button", { name: "First" }))
    await waitFor(() => expect(onSend).toHaveBeenCalledOnce())
    expect(onSend.mock.calls[0]![0]).toContain(photo)
    expect(onSend.mock.calls[0]![0]).not.toContain("blob:")
  })

  it("retains loaded pictures while streaming adds more cards", async () => {
    const code = (includeOther: boolean) => `root = VisualCardBlock([first, second${includeOther ? ", third" : ""}])
first = VisualCardItem(BoldText("text", "First", null, "text", "sm"), "first", "${photo}")
second = VisualCardItem(BoldText("text", "Second", null, "text", "sm"), "second", "${photo}")
${includeOther ? `third = VisualCardItem(BoldText("text", "Third", null, "text", "sm"), "third", "${other}")` : ""}`
    let resolveOther!: (response: Response) => void
    const { container, rerender } = render(<GenuiBlock code={code(false)} streaming />, { wrapper: ThemeProvider })
    await waitFor(() => expect(container.querySelectorAll('[style*="blob:proxy-1"]')).toHaveLength(2))
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOther = resolve
        })
    )
    rerender(<GenuiBlock code={code(true)} streaming />)
    expect(container.querySelectorAll('[style*="blob:proxy-1"]')).toHaveLength(2)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => resolveOther(new Response("image")))
    await waitFor(() => expect(container.querySelectorAll('[style*="blob:proxy-"]')).toHaveLength(3))
  })

  it("does not retry a failed image directly at its source", async () => {
    fetchMock.mockRejectedValue(new Error("Image unavailable"))
    const { container } = render(<GenuiBlock code={`root = Image("Missing", "${photo}")`} streaming={false} />, { wrapper: ThemeProvider })
    await waitFor(() => expect(screen.getByAltText("Missing")).toHaveAttribute("src", "data:,"))
    expect(container.querySelectorAll('img[src^="https://"]')).toHaveLength(0)
  })

  it("also proxies images in OpenUI MarkDownRenderer", async () => {
    render(<GenuiBlock code={`root = MarkDownRenderer("![Photo](${photo})")`} streaming={false} />, { wrapper: ThemeProvider })
    await waitFor(() => expect(screen.getByAltText("Photo")).toHaveAttribute("src", "blob:proxy-1"))
  })
})
