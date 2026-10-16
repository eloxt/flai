import { createContext, type ComponentProps, useContext, useEffect, useState } from "react"
import { defaultComponents } from "streamdown"
import { apiFetch } from "~/lib/api"

export const ImageProxyContext = createContext("/images/proxy")
const StreamdownImage = defaultComponents.img

export function ProxiedImage({ src, srcSet: _srcSet, ...props }: ComponentProps<typeof StreamdownImage>) {
  const path = useContext(ImageProxyContext)
  const remote = typeof src === "string" && /^(https?:)?\/\//i.test(src)
  const url = remote ? (src.startsWith("//") ? `https:${src}` : src) : null
  const source = url ? `${path}?url=${encodeURIComponent(url)}` : null
  const [image, setImage] = useState<{
    source: string
    url: string | null
  } | null>(null)

  useEffect(() => {
    if (!source) return
    const controller = new AbortController()
    let objectUrl: string | undefined
    apiFetch(source, {
      auth: !path.startsWith("/public/"),
      signal: controller.signal,
    })
      .then((response) => response.blob())
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setImage({ source, url: objectUrl })
      })
      .catch(() => {
        if (!controller.signal.aborted) setImage({ source, url: null })
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [source, path])

  if (!source) return <StreamdownImage {...props} src={src} />
  const resolved = image?.source === source ? image.url : undefined
  // An empty data URL uses Streamdown's existing failure UI without retrying the remote host.
  const displaySrc = resolved === undefined ? "streamdown:incomplete-image" : (resolved ?? "data:,")
  return <StreamdownImage {...props} key={displaySrc} src={displaySrc} />
}
