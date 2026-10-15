import type { ErrorCode } from '@flai/shared'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  BAD_REQUEST: 400,
  VALIDATION: 422,
  UNAUTHORIZED: 401,
  USER_INACTIVE: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NOT_CONFIGURED: 412,
  UPSTREAM: 502,
  INTERNAL: 500,
}

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }

  get status(): ContentfulStatusCode {
    return STATUS[this.code]
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found`)
export const badRequest = (message: string, details?: unknown) => new AppError('BAD_REQUEST', message, details)
export const forbidden = (message = 'Forbidden') => new AppError('FORBIDDEN', message)

/** Readable message for any thrown value. Mastra serializes stream errors (with stack) as JSON; keep only the message. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  try {
    const parsed = JSON.parse(raw) as { message?: unknown }
    if (typeof parsed?.message === 'string') return parsed.message
  } catch {
    // not JSON
  }
  return raw
}
