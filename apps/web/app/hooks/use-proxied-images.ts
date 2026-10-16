import { createContext, useContext, useEffect, useRef, useState } from "react"
import { apiFetch } from "~/lib/api"

export const ImageProxyContext = createContext("/images/proxy")
/** Keep original image URLs available to generated UI actions. */
export const ImageSourceContext = createContext<Map<string, string> | null>(null)

/** Resolve remote image URLs before any renderer can request the original host. */
export function useProxiedImages(sources: string[]) {
  const path = useContext(ImageProxyContext)
  const imageSources = useContext(ImageSourceContext)
  const requests = new Map(
    sources.map((src) => {
      const normalized = src.trim().replace(/[\t\r\n]/g, "")
      const url = normalized.startsWith("//") ? `https:${normalized}` : normalized
      return [src, /^(https?:|\/\/)/i.test(normalized) && URL.canParse(url) ? `${path}?url=${encodeURIComponent(url)}` : null] as const
    })
  )
  const requestKey = JSON.stringify([...new Set([...requests.values()].filter((source) => source !== null))].sort())
  const downloads = useRef(new Map<string, { controller: AbortController; objectUrl?: string }>())
  const [images, setImages] = useState<Record<string, string>>({})

  useEffect(() => {
    const needed = new Set<string>(JSON.parse(requestKey))
    for (const [source, download] of downloads.current) {
      if (needed.has(source)) continue
      download.controller.abort()
      if (download.objectUrl) {
        URL.revokeObjectURL(download.objectUrl)
        imageSources?.delete(download.objectUrl)
      }
      downloads.current.delete(source)
      setImages((current) => {
        const next = { ...current }
        delete next[source]
        return next
      })
    }
    for (const source of needed) {
      if (downloads.current.has(source)) continue
      const download = { controller: new AbortController(), objectUrl: undefined as string | undefined }
      downloads.current.set(source, download)
      apiFetch(source, { auth: !path.startsWith("/public/"), signal: download.controller.signal })
        .then((response) => response.blob())
        .then((blob) => {
          if (download.controller.signal.aborted) return
          download.objectUrl = URL.createObjectURL(blob)
          imageSources?.set(download.objectUrl, new URLSearchParams(source.slice(source.indexOf("?") + 1)).get("url")!)
          setImages((current) => ({ ...current, [source]: download.objectUrl! }))
        })
        .catch(() => {
          if (!download.controller.signal.aborted) setImages((current) => ({ ...current, [source]: "data:," }))
        })
    }
  }, [requestKey, path, imageSources])

  useEffect(() => {
    const current = downloads.current
    return () => {
      for (const download of current.values()) {
        download.controller.abort()
        if (download.objectUrl) {
          URL.revokeObjectURL(download.objectUrl)
          imageSources?.delete(download.objectUrl)
        }
      }
      current.clear()
    }
  }, [imageSources])

  return new Map([...requests].map(([src, source]) => [src, source ? images[source] : src]))
}
