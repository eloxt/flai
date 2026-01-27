import type { User, TokenPair, AuthResponse } from "../types/shared";

// Re-export for backward compatibility
export type AuthUser = User;
export type { TokenPair, AuthResponse };

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