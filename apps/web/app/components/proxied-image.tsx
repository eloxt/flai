import type { ComponentProps } from "react"
import { defaultComponents } from "streamdown"
import { useProxiedImages } from "~/hooks/use-proxied-images"

export { ImageProxyContext } from "~/hooks/use-proxied-images"
const StreamdownImage = defaultComponents.img

export function ProxiedImage({ src, srcSet: _srcSet, ...props }: ComponentProps<typeof StreamdownImage>) {
  const images = useProxiedImages(typeof src === "string" ? [src] : [])
  const resolved = typeof src === "string" ? images.get(src) : src
  // Loading/error placeholders never fall back to requesting the remote host directly.
  const displaySrc = resolved === undefined ? "streamdown:incomplete-image" : resolved
  return <StreamdownImage {...props} key={typeof displaySrc === "string" ? displaySrc : undefined} src={displaySrc} />
}
