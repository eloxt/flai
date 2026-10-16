import { Hono } from 'hono'
import { type AppEnv, query } from '../lib/hono'
import { imageProxyQuerySchema, proxyImage } from '../services/image-proxy'

export const imageRoutes = new Hono<AppEnv>().get('/images/proxy', async (c) => {
  const { url } = query(c, imageProxyQuerySchema)
  return proxyImage(url, c.req.raw.signal)
})
