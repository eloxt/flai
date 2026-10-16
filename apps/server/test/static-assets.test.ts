import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const directory = mkdtempSync(join(tmpdir(), 'flai-static-'))
const script = 'console.log("FlaiChat");\n'.repeat(100)
const html = '<!DOCTYPE html><html><body>FlaiChat</body></html>'
let app: ReturnType<typeof import('../src/app').createApp>

beforeAll(async () => {
  mkdirSync(join(directory, 'assets'))
  mkdirSync(join(directory, 'locales/en'), { recursive: true })
  writeFileSync(join(directory, 'index.html'), html)
  writeFileSync(join(directory, 'assets/app-12345678.js'), script)
  writeFileSync(join(directory, 'locales/en/translation.json'), '{"title":"FlaiChat"}')
  vi.stubEnv('WEB_DIST', directory)
  const { createApp } = await import('../src/app')
  app = createApp()
})

afterAll(() => {
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

describe('production static assets', () => {
  it('compresses hashed assets and lets browsers cache them immutably', async () => {
    const response = await app.request('/assets/app-12345678.js', {
      headers: { 'Accept-Encoding': 'gzip' },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('Content-Encoding')).toBe('gzip')
    expect(response.headers.get('Vary')).toContain('Accept-Encoding')
    expect(gunzipSync(Buffer.from(await response.arrayBuffer())).toString()).toBe(script)
  })

  it('serves an uncompressed variant when compression is not requested', async () => {
    const response = await app.request('/assets/app-12345678.js')
    expect(response.headers.get('Content-Encoding')).toBeNull()
    expect(response.headers.get('Vary')).toContain('Accept-Encoding')
    expect(await response.text()).toBe(script)
  })

  it('revalidates both the HTML entry and client-side routes', async () => {
    for (const path of ['/', '/index.html', '/chat/example']) {
      const response = await app.request(path)
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
      expect(await response.text()).toBe(html)
    }
  })

  it('revalidates public files without content hashes', async () => {
    const response = await app.request('/locales/en/translation.json')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(await response.json()).toEqual({ title: 'FlaiChat' })
  })

  it('returns 404 for missing assets instead of serving the SPA entry', async () => {
    const response = await app.request('/assets/missing.js')
    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBeNull()
    expect(await response.text()).toBe('Not found')
  })

  it('keeps static asset compression and caching out of API responses', async () => {
    const response = await app.request('/api/v1/models', {
      headers: { 'Accept-Encoding': 'gzip' },
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('Content-Encoding')).toBeNull()
    expect(response.headers.get('Cache-Control')).toBeNull()
    await response.json()
  })
})
