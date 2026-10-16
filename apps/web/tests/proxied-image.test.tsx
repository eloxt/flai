import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ImageProxyContext, ProxiedImage } from "~/components/proxied-image"
import { apiFetch } from "~/lib/api"

vi.mock("~/lib/api", () => ({ apiFetch: vi.fn() }))
vi.mock("streamdown", () => ({
  defaultComponents: {
    img: ({ src, ...props }: React.ComponentProps<"img">) =>
      src === "streamdown:incomplete-image" ? (
        <span>Loading image</span>
      ) : (
        <img {...props} src={src} />
      ),
  },
}))

const fetchMock = vi.mocked(apiFetch)
const imageUrl = "https://images.example/photo.jpg"
beforeEach(() => {
  vi.resetAllMocks()
  URL.createObjectURL = vi.fn(() => "blob:proxied-image")
  URL.revokeObjectURL = vi.fn()
  fetchMock.mockResolvedValue(
    new Response("image", { headers: { "content-type": "image/jpeg" } })
  )
})
afterEach(cleanup)

describe("proxied Markdown images", () => {
  it("uses the authenticated backend and retains image props", async () => {
    const { unmount } = render(
      <ProxiedImage
        src={imageUrl}
        alt="Photo"
        title="Caption"
        srcSet="https://unproxied.example/photo.jpg 2x"
      />
    )
    await waitFor(() =>
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "blob:proxied-image"
      )
    )
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Photo")
    expect(screen.getByRole("img")).toHaveAttribute("title", "Caption")
    expect(screen.getByRole("img")).not.toHaveAttribute("srcset")
    expect(fetchMock).toHaveBeenCalledWith(
      `/images/proxy?url=${encodeURIComponent(imageUrl)}`,
      {
        auth: true,
        signal: expect.any(AbortSignal),
      }
    )
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:proxied-image")
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true)
  })

  it("uses a share-specific public endpoint without sending credentials", async () => {
    render(
      <ImageProxyContext value="/public/shares/share-id/images">
        <ProxiedImage src={imageUrl} alt="Photo" />
      </ImageProxyContext>
    )
    await waitFor(() =>
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "blob:proxied-image"
      )
    )
    expect(fetchMock.mock.calls[0]).toEqual([
      `/public/shares/share-id/images?url=${encodeURIComponent(imageUrl)}`,
      {
        auth: false,
        signal: expect.any(AbortSignal),
      },
    ])
  })

  it("leaves local and inline images alone", () => {
    for (const src of [
      "/local.png",
      "blob:uploaded-image",
      "data:image/png;base64,AA==",
      "streamdown:incomplete-image",
    ]) {
      const { unmount } = render(<ProxiedImage src={src} alt="Photo" />)
      unmount()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows failure through Streamdown without falling back to an external request", async () => {
    fetchMock.mockRejectedValue(new Error("Image unavailable"))
    render(<ProxiedImage src={imageUrl} alt="Photo" />)
    await waitFor(() =>
      expect(screen.getByRole("img")).toHaveAttribute("src", "data:,")
    )
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it("does not let a cancelled download replace a newer image", async () => {
    let resolveFirst!: (response: Response) => void
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        })
    )
    const { rerender } = render(<ProxiedImage src={imageUrl} alt="Photo" />)
    const firstSignal = fetchMock.mock.calls[0]![1]!.signal!
    rerender(
      <ProxiedImage src="https://images.example/new.jpg" alt="New photo" />
    )
    expect(firstSignal.aborted).toBe(true)
    await waitFor(() =>
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "blob:proxied-image"
      )
    )
    await act(async () => resolveFirst(new Response("stale image")))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("img")).toHaveAttribute("alt", "New photo")
  })
})
