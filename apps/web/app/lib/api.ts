import type { ApiErrorBody, AuthResult, ErrorCode } from "@flai/shared"
import { useAuthStore } from "~/store/auth-store"

const BASE = "/api/v1"

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "NETWORK",
    message: string,
    readonly details?: unknown
  ) {
    super(message)
    this.name = "ApiError"
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  /** Send without the bearer token (public endpoints). */
  auth?: boolean
  signal?: AbortSignal
  query?: Record<string, string | number | boolean | undefined | null>
}

let refreshing: Promise<boolean> | null = null

/** Exchange the refresh token for a new pair. Concurrent callers share one request. */
function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const { tokens, sessionVersion } = useAuthStore.getState()
    if (!tokens?.refreshToken) return false
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      })
      if (!res.ok) return false
      const result = (await res.json()) as AuthResult
      // Ignore the result if the user logged out/in while we were refreshing.
      if (useAuthStore.getState().sessionVersion !== sessionVersion) return false
      useAuthStore.getState().refreshed(result)
      return true
    } catch {
      return false
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${BASE}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody
    return new ApiError(res.status, body.error.code, body.error.message, body.error.details)
  } catch {
    return new ApiError(res.status, "INTERNAL", res.statusText || `HTTP ${res.status}`)
  }
}

/** Raw fetch with auth, silent token refresh and error mapping. */
export async function apiFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const { method = "GET", body, auth = true, signal, query } = options
  const sessionVersion = useAuthStore.getState().sessionVersion
  const isForm = body instanceof FormData

  const send = () => {
    const headers: Record<string, string> = {}
    if (body !== undefined && !isForm) headers["content-type"] = "application/json"
    const token = useAuthStore.getState().tokens?.accessToken
    if (auth && token) headers.authorization = `Bearer ${token}`
    return fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal,
    })
  }

  let res: Response
  try {
    res = await send()
    if (res.status === 401 && auth && (await refreshSession())) res = await send()
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error
    throw new ApiError(0, "NETWORK", "Network error, please check your connection")
  }

  if (res.status === 401 && auth) {
    // Only end the session that issued this request; a newer login must survive.
    if (useAuthStore.getState().sessionVersion === sessionVersion) useAuthStore.getState().logout()
    throw await toApiError(res)
  }
  if (!res.ok) throw await toApiError(res)
  return res
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await apiFetch(path, options)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function errorText(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}
