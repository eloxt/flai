interface UserPreference {
  sidebar_show_emoji?: boolean;
}

// Consolidated User interface (merge AuthUser + User)
interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: number;
  avatar?: string;
  created_at?: string;
  preference?: UserPreference | string;
}

// Token pair for authentication
interface TokenPair {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

// Auth response structure
interface AuthResponse {
  code: number;
  data: {
    user?: User;
    token?: TokenPair;
  }
  message?: string;
}

// Consolidated Notification interface
interface Notification {
  id: string;
  title: string;
  content: string;
  level: string;
}

export type { User, UserPreference, TokenPair, AuthResponse, Notification };
