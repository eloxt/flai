// Standardized ApiResponse (use the one from api.ts)
interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T | null;
}

interface ApiPageResponse<T = any> {
  total: number;
  current: number;
  size: number;
  records: T[];
}

interface ApiRequestInit extends RequestInit {
  skipAuth?: boolean;
}

class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
    public response?: Response
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type { ApiResponse, ApiPageResponse, ApiRequestInit };
export { ApiError };
