import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthUser, TokenPair } from "../lib/auth-client";

interface AuthState {
  user: AuthUser | null;
  tokens: TokenPair | null;
  expiresAt: Date | null;
  login: (data: { user?: AuthUser; token?: TokenPair }) => void;
  logout: () => void;
  updateUser: (user: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      expiresAt: null,
      login: (data: { user?: AuthUser; token?: TokenPair }) => {
        set({
          user: data.user || null,
          tokens: data.token || null,
          expiresAt: new Date(new Date().getTime() + (data.token?.expires_in ?? 0) * 1000),
        });
      },
      logout: () => {
        set({
          user: null,
          tokens: null,
          expiresAt: null,
        });
      },
      updateUser: (userUpdates: Partial<AuthUser>) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...userUpdates } : null,
        }));
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        expiresAt: state.expiresAt,
      }),
    }
  )
);
