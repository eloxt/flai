import { useAuthStore } from "../store/auth-store";

export interface ApiRequestInit extends RequestInit {
    auth?: boolean;
}

export interface ApiResponse<T = any> {
    code: number;
    message: string;
    data: T | null;
}

export interface ApiPageResponse<T = any> {
    total: number;
    current: number,
    size: number,
    records: T[];
}

export class ApiError extends Error {
    constructor(
        public code: number,
        public message: string
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export async function request<T>(url: string, options?: ApiRequestInit): Promise<T> {
    const { auth = true, headers, ...rest } = options || {};
    // const logout = useAuthStore((state) => state.logout);
    // const navigate = useNavigate();

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

    try {
        const response = await fetch(url, config);

        if (!response.ok) {
            throw new ApiError(response.status, `HTTP error! status: ${response.status}`);
        }

        const res = await response.json() as ApiResponse<T>;

        if (res.code !== 0) {
            if (res.code === 401) {
                useAuthStore.getState().logout();
                throw new ApiError(res.code, 'Unauthorized');
            }
            throw new ApiError(res.code, res.message || 'Unknown API Error');
        }

        return res.data as T;

    } catch (error) {
        if (error instanceof ApiError) {
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
        return request<T>(url, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data),
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

        if (!response.ok) {
            throw new ApiError(response.status, `HTTP error! status: ${response.status}`);
        }

        return response;
    }
};
