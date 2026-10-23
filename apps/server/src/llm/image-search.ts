import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { safeFetch } from './safe-fetch'

// Search adapted from thesysdev/open-intelligent-ui (MIT): src/app/api/image-search/route.ts.

export const imageSearchInputSchema = z.object({
  query: z.string().transform((q) => q.replace(/\s+/g, ' ').trim()).pipe(z.string().min(2).max(200))
    .describe('The exact subject in English, 2 to 4 words: "Belém Tower Lisbon", "pastel de nata".'),
})

export interface FoundImage {
  url: string
  /** The Wikipedia article or Commons file the image comes from, to judge whether it shows the subject. */
  title: string
  width?: number
  height?: number
}

// Wikimedia rate-limits generic clients; its policy asks for a name and a contact URL.
const HEADERS = { 'user-agent': 'flai-next/1.0 (https://github.com/eloxt/flai; generative UI image search)' }
const HOSTS = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org'])
const SKIP = /\.svg|icon|logo|map|flag|seal|coat_of_arms|signature|diagram/i
const WIDTH = 960
const MAX_RESULTS = 4
const CACHE_SIZE = 500
const cache = new Map<string, FoundImage[]>()

type Page = {
  index?: number
  title?: string
  thumbnail?: { source?: string; width?: number; height?: number }
  imageinfo?: { thumburl?: string; thumbwidth?: number; thumbheight?: number; url?: string; mime?: string }[]
}

async function query(host: string, params: Record<string, string>, signal?: AbortSignal): Promise<Page[]> {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params })}`
  const timeout = AbortSignal.timeout(8000)
  const response = await safeFetch(url, { headers: HEADERS, signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (!response.ok) throw new Error(`${host} ${response.status}`)
  const data = await response.json() as { error?: unknown; query?: { pages?: Page[] } }
  // A rate limit comes back as 200 with an error body: throw so "no photos" is not cached.
  if (data.error) throw new Error(`${host} error`)
  return (data.query?.pages ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
}

// Words that say what the photo shows; an article must share one with the query.
const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3)
// "File:Torre_Belém_2009.jpg" reads as "Torre Belém 2009".
const fileTitle = (title: string) => title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replaceAll('_', ' ')

async function search(q: string, signal?: AbortSignal): Promise<FoundImage[]> {
  const images: FoundImage[] = []
  const add = (image: Partial<FoundImage>) => {
    const { url, title } = image
    if (!url || !title || SKIP.test(url) || images.some((i) => i.url === url)) return
    try {
      if (HOSTS.has(new URL(url).hostname)) images.push(image as FoundImage)
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
  for (const page of articles) {
    if (!words(page.title ?? '').some((w) => wanted.has(w))) continue
    add({ url: page.thumbnail?.source, title: page.title, width: page.thumbnail?.width, height: page.thumbnail?.height })
  }
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
      if (!info?.mime?.startsWith('image/')) continue
      add({ url: info.thumburl ?? info.url, title: fileTitle(page.title ?? ''), width: info.thumbwidth, height: info.thumbheight })
    }
  }
  return images.slice(0, MAX_RESULTS)
}

/** Photos for a subject from Wikipedia and Wikimedia Commons; failures are retried next time. */
export async function searchImages(q: string, signal?: AbortSignal): Promise<FoundImage[]> {
  const cached = cache.get(q)
  if (cached) return cached
  let images: FoundImage[]
  try {
    images = await search(q, signal)
  } catch {
    throw new Error(signal?.aborted ? 'Image search cancelled or timed out' : 'Image search is unavailable right now')
  }
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
  cache.set(q, images)
  return images
}

export const imageSearchTool = createTool({
  id: 'image_search',
  title: 'Image search',
  description: [
    'Find real photos of a named place, dish, product, artwork, animal or other thing with a look, from Wikipedia and Wikimedia Commons.',
    'Returns up to 4 images with the article or file title they come from, and their size. Use only an image whose title shows the subject;',
    'if none does, search again with a more specific name or show no image. Then display it by URL with Image or ImageGallery, or as a markdown image.',
  ].join(' '),
  inputSchema: imageSearchInputSchema,
  execute: async (input, context) => {
    const { query } = imageSearchInputSchema.parse(input)
    return { images: await searchImages(query, context?.abortSignal) }
  },
})
