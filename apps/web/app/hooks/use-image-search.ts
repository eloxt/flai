import { createContext, useContext, useEffect, useState } from "react"
import { api } from "~/lib/api"

/** Where SearchImage looks photos up; public share pages point it at their own endpoint. */
export const ImageSearchContext = createContext("/images/search")

const searches = new Map<string, Promise<string[]>>()

function searchImages(path: string, q: string): Promise<string[]> {
  const key = `${path}?${q}`
  let request = searches.get(key)
  if (!request) {
    request = api<{ images: string[] }>(path, {
      auth: !path.startsWith("/public/"),
      query: { q },
    })
      .then((result) => result.images)
      .catch(() => [])
      .then((images) => {
        // Empty results and failures are retried by the next component that asks.
        if (!images.length) searches.delete(key)
        return images
      })
    if (searches.size > 200) searches.delete(searches.keys().next().value!)
    searches.set(key, request)
  }
  return request
}

/** Photo URLs for `query`, or undefined while waiting. The query settles first: it may still be streaming. */
export function useImageSearch(query: string | null): string[] | undefined {
  const path = useContext(ImageSearchContext)
  const [result, setResult] = useState<{
    query: string
    images: string[]
  } | null>(null)
  useEffect(() => {
    if (!query) return
    let active = true
    const timer = setTimeout(() => {
      searchImages(path, query).then((images) => {
        if (active) setResult({ query, images })
      })
    }, 500)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [path, query])
  return query && result?.query === query ? result.images : undefined
}
