import { z } from 'zod'
import { AppError } from '../lib/errors'

const sourceSchema = z.object({ url: z.string(), title: z.string().nullish() }).passthrough()
export const exaResponseSchema = z.object({
  results: z.array(sourceSchema.extend({ subpages: z.array(sourceSchema).optional() })),
  statuses: z.array(z.object({
    id: z.string(), status: z.enum(['success', 'error']),
    source: z.string().optional(),
    error: z.object({ tag: z.string().optional(), httpStatusCode: z.number().int().min(100).max(599).nullish() }).nullish(),
  }).passthrough()).optional(),
  output: z.object({
    grounding: z.array(z.object({ citations: z.array(sourceSchema) }).passthrough()).optional(),
  }).passthrough().optional(),
}).passthrough()

/** Search and page retrieval share authentication, cancellation, and error handling. */
export async function requestExa(endpoint: 'search' | 'contents', input: Record<string, unknown>, apiKey: string, abortSignal?: AbortSignal) {
  if (!apiKey) throw new AppError('NOT_CONFIGURED', 'Exa API key is not configured')
  const operation = endpoint === 'search' ? 'search' : 'fetch'
  const signal = AbortSignal.any([AbortSignal.timeout(180_000), ...(abortSignal ? [abortSignal] : [])])
  try {
    const response = await fetch(`https://api.exa.ai/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(input),
      signal,
    })
    if (!response.ok) {
      const reason = ({
        400: 'Invalid Exa request parameters', 401: 'Invalid Exa API key', 402: 'Exa credits or spending budget exhausted',
        403: 'Exa access denied', 429: 'Exa rate limit exceeded; try again later',
      } as Record<number, string>)[response.status] ?? `Exa ${operation} service unavailable`
      await response.body?.cancel()
      throw new AppError('UPSTREAM', `${reason} (HTTP ${response.status})`)
    }
    const result = exaResponseSchema.safeParse(await response.json())
    if (!result.success) throw new AppError('UPSTREAM', `Exa returned an invalid ${operation} response`)
    // Preserve page contents, per-URL statuses, notices, metadata and costs; warnings are diagnostic only.
    const { warnings, ...data } = result.data
    if (warnings) console.warn(`Exa ${operation} warnings`, JSON.stringify(warnings).replaceAll(apiKey, '[REDACTED]'))
    return data
  } catch (error) {
    if (error instanceof AppError) throw error
    if (abortSignal?.aborted) throw new AppError('UPSTREAM', `Web ${operation} cancelled`)
    if (signal.aborted) throw new AppError('UPSTREAM', `Exa ${operation} timed out`)
    throw new AppError('UPSTREAM', `Could not complete Exa ${operation}`)
  }
}
