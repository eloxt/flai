import { z } from 'zod'
import { AppError } from '../lib/errors'
import { safeFetch } from '../llm/safe-fetch'

export const imageProxyQuerySchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(8192),
})

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon'])

/** Fetch afresh without forwarding the browser's credentials or Referer. */
export async function proxyImage(url: string, requestSignal: AbortSignal): Promise<Response> {
  const controller = new AbortController()
  const signal = AbortSignal.any([requestSignal, controller.signal, AbortSignal.timeout(30_000)])
  try {
    const upstream = await safeFetch(url, {
      signal,
      headers: { accept: [...IMAGE_TYPES].join(', ') },
    }, { allowCrossOriginRedirects: true })
    if (!upstream.ok) throw new AppError('UPSTREAM', `Image request failed (HTTP ${upstream.status})`)

    const upstreamType = upstream.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
    const type = upstreamType === 'image/jpg' ? 'image/jpeg' : upstreamType
    if (!type || !IMAGE_TYPES.has(type)) throw new AppError('UPSTREAM', 'Unsupported image type')
    if (Number(upstream.headers.get('content-length')) > MAX_IMAGE_BYTES) {
      throw new AppError('UPSTREAM', 'Image exceeds the 10 MB limit')
    }
    if (!upstream.body) throw new AppError('UPSTREAM', 'Empty image response')

    // Bound decoded bytes too: Content-Length can be missing or describe compressed data.
    const reader = upstream.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_IMAGE_BYTES) throw new AppError('UPSTREAM', 'Image exceeds the 10 MB limit')
      chunks.push(value)
    }
    if (!size) throw new AppError('UPSTREAM', 'Empty image response')

    return new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: {
        'Content-Type': type,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('UPSTREAM', signal.aborted ? 'Image request cancelled or timed out' : 'Unable to fetch image')
  } finally {
    // Also close upstream bodies when type/size validation fails.
    controller.abort()
  }
}
