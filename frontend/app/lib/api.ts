import { useAuthStore } from "../store/auth-store";
import type { ApiResponse, ApiPageResponse } from "../types/api";
import { ApiError } from "../types/api";

// Re-export types for backward compatibility
export type { ApiResponse, ApiPageResponse };
export { ApiError };

export interface ApiRequestInit extends RequestInit {
    auth?: boolean;
}

export async function request<T>(url: string, options?: ApiRequestInit): Promise<T> {
    const { auth = true, headers, ...rest } = options || {};
    const sessionVersion = useAuthStore.getState().sessionVersion;

    const defaultHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (options?.body instanceof FormData) {
        delete defaultHeaders['Content-Type'];
    }

    if (auth) {
        const token = useAuthStore.getState().tokens?.access_token;
        if (token) {
            defaultHeaders['Authorization'] = `Bearer ${token}`;
        }
    }

    const config: RequestInit = {
        ...rest,
        headers: {
            ...defaultHeaders,
            ...headers,
        },
    };

    try {
        const response = await fetch(url, config);
        if (auth && sessionVersion !== useAuthStore.getState().sessionVersion) {
            await response.body?.cancel();
            throw new DOMException("Session changed", "AbortError");
        }
        if (response.status === 401 && auth) useAuthStore.getState().logout();

        if (!response.ok) {
            throw new ApiError(response.status, `HTTP error! status: ${response.status}`);
        }

        const res = await response.json() as ApiResponse<T>;
        if (auth && sessionVersion !== useAuthStore.getState().sessionVersion) throw new DOMException("Session changed", "AbortError");

        if (res.code !== 0) {
            if (res.code === 401) {
                useAuthStore.getState().logout();
                throw new ApiError(res.code, 'Unauthorized');
            }
            throw new ApiError(res.code, res.message || 'Unknown API Error');
        }

        return res.data as T;

    } catch (error) {
        if (error instanceof ApiError || (error instanceof DOMException && error.name === "AbortError")) {
            throw error;
        }
        throw new ApiError(-1, error instanceof Error ? error.message : 'Network request failed');
    }
}

export const api = {
    get: <T>(url: string, params?: Record<string, any>, options?: ApiRequestInit) => {
        const queryString = params
            ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
            : '';
        return request<T>(`${url}${queryString}`, {
            ...options,
            method: 'GET'
        });
    },
    post: <T>(url: string, data?: any, options?: ApiRequestInit) => {
        const isFormData = data instanceof FormData;
        return request<T>(url, {
            ...options,
            method: 'POST',
            body: isFormData ? data : JSON.stringify(data),
        });
    },
    put: <T>(url: string, data?: any, options?: ApiRequestInit) => {
        return request<T>(url, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    del: <T>(url: string, data?: any, options?: ApiRequestInit) => {
        return request<T>(url, {
            ...options,
            method: 'DELETE',
            body: JSON.stringify(data),
        });
    },
    stream: async (url: string, options?: ApiRequestInit): Promise<Response> => {
        const { auth = true, headers, ...rest } = options || {};
        const sessionVersion = useAuthStore.getState().sessionVersion;

        const defaultHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (auth) {
            const token = useAuthStore.getState().tokens?.access_token;
            if (token) {
                defaultHeaders['Authorization'] = `Bearer ${token}`;
            }
        }

        const config: RequestInit = {
            ...rest,
            headers: {
                ...defaultHeaders,
                ...headers,
            },
        };

        const response = await fetch(url, config);
        if (auth && sessionVersion !== useAuthStore.getState().sessionVersion) {
            await response.body?.cancel();
            throw new DOMException("Session changed", "AbortError");
        }
        if (response.status === 401 && auth) useAuthStore.getState().logout();

        if (!response.ok) {
            throw new ApiError(response.status, `HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/event-stream")) {
            if (contentType.includes("application/json")) {
                const result = await response.json() as ApiResponse<unknown>;
                if (auth && sessionVersion !== useAuthStore.getState().sessionVersion) throw new DOMException("Session changed", "AbortError");
                if (result.code === 401 && auth) useAuthStore.getState().logout();
                throw new ApiError(result.code || -1, result.message || "Expected an event stream");
            }
            await response.body?.cancel();
            throw new ApiError(-1, "Expected an event stream");
        }
        return response;
    }
};

// Both chat and translation use the same SSE completion and error contract.
export async function* readSSE<T>(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<T> {
    const decoder = new TextDecoder();
    let buffer = "";
    let data: string[] = [];
    try {
        while (true) {
            const { done, value } = await reader.read();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            if (done) buffer += "\n\n"; // Also consume a final event without a trailing newline.
            let newline: number;
            while ((newline = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, newline).replace(/\r$/, "");
                buffer = buffer.slice(newline + 1);
                if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
                else if (line === "" && data.length > 0) {
                    const payload = data.join("\n");
                    data = [];
                    if (payload === "[DONE]") return;
                    const event = JSON.parse(payload);
                    if (event.type === "error") throw new ApiError(-1, event.data?.message || "Generation failed");
                    yield event as T;
                }
            }
            if (done) throw new ApiError(-1, "Stream ended before completion");
        }
    } finally {
        try { await reader.cancel(); } finally { reader.releaseLock(); }
    }
}
