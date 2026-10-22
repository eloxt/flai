import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../src/lib/errors'

vi.mock('../src/llm/safe-fetch', () => ({ safeFetch: vi.fn() }))
vi.mock('../src/db', async () => ({
  schema: await import('../src/db/schema'),
  db: { query: { shares: { findFirst: vi.fn() } } },
}))

import { db } from '../src/db'
import { safeFetch } from '../src/llm/safe-fetch'
import { imageRoutes } from '../src/routes/images'
import { publicShareRoutes } from '../src/routes/shares'

const fetchMock = vi.mocked(safeFetch)
const findShare = vi.mocked(db.query.shares.findFirst)
const app = new Hono().route('/', imageRoutes).route('/public', publicShareRoutes)
  .onError((error, c) => c.json({ error: error.message }, error instanceof AppError ? error.status : 500))

const thumb = (name: string) => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}/960px-${name}`
const pages = (list: object[]) => Response.json({ query: { pages: list } })
type ShareRow = NonNullable<Awaited<ReturnType<typeof db.query.shares.findFirst>>>
const share = (text: string) => ({ expiresAt: null, messages: [{ parts: [{ type: 'text', text }] }] }) as ShareRow

let counter = 0
// The service caches per query, so each test searches for something new.
const unique = (q: string) => `${q} ${++counter}`

beforeEach(() => {
  vi.resetAllMocks()
  fetchMock.mockImplementation(async (url) => {
    const host = new URL(url.toString()).hostname
    if (host === 'en.wikipedia.org') {
      return pages([
        { index: 3, title: 'Belem Tower', thumbnail: { source: thumb('Tower.jpg') } },
        { index: 2, title: 'Belem Tower interior', thumbnail: { source: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/Inside.jpg' } },
        { index: 1, title: 'Unrelated article', thumbnail: { source: thumb('Other.jpg') } },
      ])
    }
    return pages([
      { imageinfo: [{ mime: 'image/jpeg', thumburl: thumb('Commons.jpg') }] },
      { imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://elsewhere.example/photo.jpg' }] },
      { imageinfo: [{ mime: 'image/jpeg', thumburl: thumb('City_logo.png') }] },
      { imageinfo: [{ mime: 'application/pdf', url: thumb('Doc.pdf') }] },
    ])
  })
})

describe('image search', () => {
  it('returns matching Wikipedia lead images, then Commons files from the upload host', async () => {
    const response = await app.request(`/images/search?q=${encodeURIComponent(unique('Belem   tower'))}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      images: ['https://thumb.wikimedia.org/wikipedia/commons/thumb/Inside.jpg', thumb('Tower.jpg'), thumb('Commons.jpg')],
    })
    const search = new URL(fetchMock.mock.calls[0]![0].toString())
    expect(search.searchParams.get('gsrsearch')).toMatch(/^Belem tower \d+$/)
  })

  it('caches results per query', async () => {
    const q = encodeURIComponent(unique('Belem tower'))
    await app.request(`/images/search?q=${q}`)
    const calls = fetchMock.mock.calls.length
    expect((await app.request(`/images/search?q=${q}`)).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(calls)
  })

  it('rejects short or long queries before searching', async () => {
    for (const q of ['', ' a ', 'x'.repeat(201)]) {
      expect((await app.request(`/images/search?q=${encodeURIComponent(q)}`)).status).toBe(422)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports an upstream failure without caching it', async () => {
    const q = encodeURIComponent(unique('Belem tower'))
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: 'ratelimited' } }))
    expect((await app.request(`/images/search?q=${q}`)).status).toBe(502)
    expect((await app.request(`/images/search?q=${q}`)).status).toBe(200)
  })
})

describe('image search in public shares', () => {
  it('only searches for queries that appear in the snapshot', async () => {
    const q = unique('Belem tower')
    const path = `/public/shares/share-id/image-search?q=${encodeURIComponent(q)}`
    findShare.mockResolvedValueOnce(share('root = Stack([TextContent("hi")])'))
    expect((await app.request(path)).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
    findShare.mockResolvedValueOnce(share(`photo = SearchImage("${q}", 1.5)`))
    expect((await app.request(path)).status).toBe(200)
  })

  it('proxies upload-host images only for snapshots with a SearchImage', async () => {
    const path = `/public/shares/share-id/images?url=${encodeURIComponent(thumb('Tower.jpg'))}`
    fetchMock.mockResolvedValue(new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } }))
    findShare.mockResolvedValueOnce(share('root = Stack([TextContent("hi")])'))
    expect((await app.request(path)).status).toBe(404)
    findShare.mockResolvedValueOnce(share('photo = SearchImage("Belem tower")'))
    expect((await app.request(path)).status).toBe(200)
    const other = `/public/shares/share-id/images?url=${encodeURIComponent('https://elsewhere.example/photo.jpg')}`
    findShare.mockResolvedValueOnce(share('photo = SearchImage("Belem tower")'))
    expect((await app.request(other)).status).toBe(404)
  })
})
