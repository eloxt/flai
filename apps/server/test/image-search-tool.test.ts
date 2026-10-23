import { noopObserve } from '@mastra/core/tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/llm/safe-fetch', () => ({ safeFetch: vi.fn() }))

import { imageSearchInputSchema, imageSearchTool } from '../src/llm/image-search'
import { safeFetch } from '../src/llm/safe-fetch'

const fetchMock = vi.mocked(safeFetch)
const thumb = (name: string) => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}/960px-${name}`
const pages = (list: object[]) => Response.json({ query: { pages: list } })
const search = (query: string) => imageSearchTool.execute!({ query }, { observe: noopObserve }) as Promise<{ images: unknown[] }>

let counter = 0
// Results are cached per query, so each test searches for something new.
const unique = (q: string) => `${q} ${++counter}`

beforeEach(() => {
  vi.resetAllMocks()
  fetchMock.mockImplementation(async (url) => {
    const host = new URL(url.toString()).hostname
    if (host === 'en.wikipedia.org') {
      return pages([
        { index: 3, title: 'Belem Tower', thumbnail: { source: thumb('Tower.jpg'), width: 960, height: 1280 } },
        { index: 2, title: 'Belem Tower interior', thumbnail: { source: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/Inside.jpg', width: 960, height: 640 } },
        { index: 1, title: 'Unrelated article', thumbnail: { source: thumb('Other.jpg') } },
      ])
    }
    return pages([
      { title: 'File:Torre_de_Belem_2009.jpg', imageinfo: [{ mime: 'image/jpeg', thumburl: thumb('Commons.jpg'), thumbwidth: 960, thumbheight: 720 }] },
      { title: 'File:Elsewhere.jpg', imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://elsewhere.example/photo.jpg' }] },
      { title: 'File:City_logo.png', imageinfo: [{ mime: 'image/jpeg', thumburl: thumb('City_logo.png') }] },
      { title: 'File:Doc.pdf', imageinfo: [{ mime: 'application/pdf', url: thumb('Doc.pdf') }] },
    ])
  })
})

describe('image_search tool', () => {
  it('returns titled Wikipedia lead images, then Commons files from Wikimedia hosts', async () => {
    const result = await search(unique('Belem   tower'))
    expect(result).toEqual({
      images: [
        { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/Inside.jpg', title: 'Belem Tower interior', width: 960, height: 640 },
        { url: thumb('Tower.jpg'), title: 'Belem Tower', width: 960, height: 1280 },
        { url: thumb('Commons.jpg'), title: 'Torre de Belem 2009', width: 960, height: 720 },
      ],
    })
    const request = new URL(fetchMock.mock.calls[0]![0].toString())
    expect(request.searchParams.get('gsrsearch')).toMatch(/^Belem tower \d+$/)
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('user-agent')).toContain('https://github.com/eloxt/flai')
  })

  it('caches results per query', async () => {
    const q = unique('Belem tower')
    await search(q)
    const calls = fetchMock.mock.calls.length
    await search(q)
    expect(fetchMock).toHaveBeenCalledTimes(calls)
  })

  it('rejects short or long queries', () => {
    for (const query of ['', ' a ', 'x'.repeat(201)]) {
      expect(imageSearchInputSchema.safeParse({ query }).success).toBe(false)
    }
  })

  it('reports an upstream failure without caching it', async () => {
    const q = unique('Belem tower')
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: 'ratelimited' } }))
    await expect(search(q)).rejects.toThrow('Image search is unavailable right now')
    expect((await search(q)).images).toHaveLength(3)
  })
})
