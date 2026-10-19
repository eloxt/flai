import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { compress } from 'hono/compress'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { config } from './config'
import { AppError } from './lib/errors'
import type { AppEnv } from './lib/hono'
import { requireAdmin, requireAuth } from './middleware/auth'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { conversationRoutes } from './routes/conversations'
import { fileRoutes } from './routes/files'
import { imageRoutes } from './routes/images'
import { mcpRoutes } from './routes/mcp'
import { meRoutes } from './routes/me'
import { messageRoutes } from './routes/messages'
import { notificationRoutes } from './routes/notifications'
import { publicShareRoutes, shareRoutes } from './routes/shares'
import { translateRoutes } from './routes/translate'
import { listPublicProviders } from './services/providers'

const JSON_BODY_LIMIT = 4 * 1024 * 1024

export function createApp() {
  const app = new Hono<AppEnv>()

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json({ error: { code: error.code, message: error.message, details: error.details } }, error.status)
    }
    if (error instanceof HTTPException) return error.getResponse()
    console.error(error)
    return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
  })

  if (config().NODE_ENV !== 'test') app.use('/api/*', logger())

  const api = new Hono<AppEnv>()
  // Only uploads may be large; JSON bodies (at most a long message or a provider's model list) stay small.
  const tooLarge = () => {
    throw new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large')
  }
  const uploadLimit = bodyLimit({ maxSize: config().MAX_UPLOAD_BYTES + 1024 * 1024, onError: tooLarge })
  const jsonLimit = bodyLimit({ maxSize: JSON_BODY_LIMIT, onError: tooLarge })
  api.use('*', (c, next) => (c.req.method === 'POST' && c.req.path === '/api/v1/files' ? uploadLimit : jsonLimit)(c, next))
  api.route('/auth', authRoutes)
  api.route('/public', publicShareRoutes)

  const authed = new Hono<AppEnv>()
  authed.use('*', requireAuth)
  authed.get('/models', (c) => c.json(listPublicProviders()))
  authed.route('/', meRoutes)
  authed.route('/', fileRoutes)
  authed.route('/', imageRoutes)
  authed.route('/', conversationRoutes)
  authed.route('/', messageRoutes)
  authed.route('/', shareRoutes)
  authed.route('/', notificationRoutes)
  authed.route('/', translateRoutes)
  authed.route('/mcp-servers', mcpRoutes)
  authed.use('/admin/*', requireAdmin)
  authed.route('/admin', adminRoutes)

  api.route('/', authed)
  app.route('/api/v1', api)
  app.all('/api/*', (c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404))

  // Serve the built SPA, falling back to index.html for client-side routes.
  const webDist = resolve(config().WEB_DIST)
  if (existsSync(resolve(webDist, 'index.html'))) {
    const indexHtml = readFileSync(resolve(webDist, 'index.html'), 'utf8')
    // Registered after the API routes so compression never buffers chat streams.
    app.use('*', compress(), async (c, next) => {
      await next()
      if (c.res.ok) {
        c.header('Cache-Control', c.req.path.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache')
      }
    })
    app.use('*', serveStatic({ root: webDist }))
    app.get('/assets/*', (c) => c.text('Not found', 404))
    app.get('*', (c) => c.html(indexHtml))
  }

  return app
}
