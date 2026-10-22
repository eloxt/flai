import { Hono } from 'hono'
import { type AppEnv, query } from '../lib/hono'
import { imageProxyQuerySchema, proxyImage } from '../services/image-proxy'
import { imageSearchQuerySchema, searchImages } from '../services/image-search'

export const imageRoutes = new Hono<AppEnv>().get('/images/proxy', async (c) => {
  const { url } = query(c, imageProxyQuerySchema)
  return proxyImage(url, c.req.raw.signal)
}).get('/images/search', async (c) => {
  const { q } = query(c, imageSearchQuerySchema)
  return c.json({ images: await searchImages(q, c.req.raw.signal) })
})
