export interface AuthUser {
  id: string;
  email: string;
  username: string;
  is_active: number;
  role: string;
}

export interface TokenPair {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface AuthResponse {
  code: number;
  data: {
    user?: AuthUser;
    token?: TokenPair;
  }
  message?: string;
}

export interface ApiResponse<T> {
  code: number;
  success: boolean;
  msg: string;
  data: T;
}

export function getInitials(name?: string) {
  if (!name) return "FL";
  const cleaned = name
    .trim()
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (cleaned.length === 0) return "FL";
  if (cleaned.length === 1) return cleaned[0].slice(0, 2).toUpperCase();
  return (cleaned[0][0] + cleaned[1][0]).toUpperCase();
}