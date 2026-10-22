import { z } from 'zod'
import { AppError } from '../lib/errors'
import { safeFetch } from '../llm/safe-fetch'

// Adapted from thesysdev/open-intelligent-ui (MIT): src/app/api/image-search/route.ts.

export const imageSearchQuerySchema = z.object({
  q: z.string().transform((q) => q.replace(/\s+/g, ' ').trim()).pipe(z.string().min(2).max(200)),
})

/** Search only returns files from these hosts, so share pages can proxy them without listing each URL. */
export const IMAGE_SEARCH_HOSTS = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org'])

// Wikimedia rate-limits generic clients; its policy asks for a name and a contact URL.
const HEADERS = { 'user-agent': 'flai-next/1.0 (https://github.com/eloxt/flai; generative UI image search)' }
const SKIP = /\.svg|icon|logo|map|flag|seal|coat_of_arms|signature|diagram/i
const WIDTH = 960
const MAX_RESULTS = 4
const CACHE_SIZE = 500
const cache = new Map<string, string[]>()

type Page = {
  index?: number
  title?: string
  thumbnail?: { source?: string }
  imageinfo?: { thumburl?: string; url?: string; mime?: string }[]
}

async function query(host: string, params: Record<string, string>, signal: AbortSignal): Promise<Page[]> {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params })}`
  const response = await safeFetch(url, { headers: HEADERS, signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) })
  if (!response.ok) throw new Error(`${host} ${response.status}`)
  const data = await response.json() as { error?: unknown; query?: { pages?: Page[] } }
  // A rate limit comes back as 200 with an error body: throw so "no photos" is not cached.
  if (data.error) throw new Error(`${host} error`)
  return (data.query?.pages ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
}

// Words that say what the photo shows; an article must share one with the query.
const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3)

async function search(q: string, signal: AbortSignal): Promise<string[]> {
  const images: string[] = []
  const add = (url: string | undefined) => {
    if (!url || SKIP.test(url) || images.includes(url)) return
    try {
      if (IMAGE_SEARCH_HOSTS.has(new URL(url).hostname)) images.push(url)
    } catch {
      // Ignore malformed URLs from the API.
    }
  }
  const wanted = new Set(words(q))
  // Wikipedia lead images first, but only for articles whose title is about the query:
  // a search for a dish should not return a restaurant chain's storefront.
  const articles = await query('en.wikipedia.org', {
    generator: 'search', gsrsearch: q, gsrlimit: '6', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: String(WIDTH),
  }, signal)
  articles.filter((page) => words(page.title ?? '').some((w) => wanted.has(w))).forEach((page) => add(page.thumbnail?.source))
  // Then Commons files, dropping trailing words when a long description finds nothing.
  const terms = q.split(' ')
  const tries = [...new Set([terms.join(' '), terms.slice(0, 3).join(' '), terms.slice(0, 2).join(' ')])]
  for (const t of tries) {
    if (images.length >= 3) break
    const files = await query('commons.wikimedia.org', {
      generator: 'search', gsrsearch: `${t} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '6',
      prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: String(WIDTH),
    }, signal)
    for (const page of files) {
      const info = page.imageinfo?.[0]
      if (info?.mime?.startsWith('image/')) add(info.thumburl ?? info.url)
    }
  }
  return images.slice(0, MAX_RESULTS)
}

/** Photo URLs for a description from Wikipedia and Wikimedia Commons; failures are retried next time. */
export async function searchImages(q: string, signal: AbortSignal): Promise<string[]> {
  const cached = cache.get(q)
  if (cached) return cached
  let images: string[]
  try {
    images = await search(q, signal)
  } catch {
    throw new AppError('UPSTREAM', signal.aborted ? 'Image search cancelled or timed out' : 'Image search unavailable')
  }
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
  cache.set(q, images)
  return images
}
