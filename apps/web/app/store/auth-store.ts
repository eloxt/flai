import { type AuthResult, resolvePreferences, type TokenPair, type User } from "@flai/shared"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

interface AuthState {
  /** Bumped on every login/logout; lets in-flight work detect a stale session. */
  sessionVersion: number
  user: User | null
  tokens: TokenPair | null
  login: (result: AuthResult) => void
  refreshed: (result: AuthResult) => void
  setTokens: (tokens: TokenPair) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

const listeners = new Set<() => void>()
/** Register a reset callback that runs whenever the session changes (login/logout). */
export function onSessionChange(listener: () => void) {
  listeners.add(listener)
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      sessionVersion: 0,
      user: null,
      tokens: null,
      login: ({ user, tokens }) => set({ sessionVersion: get().sessionVersion + 1, user, tokens }),
      refreshed: ({ user, tokens }) => set({ user, tokens }),
      setTokens: (tokens) => set({ tokens }),
      logout: () => set({ sessionVersion: get().sessionVersion + 1, user: null, tokens: null }),
      updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),
    }),
    {
      name: "flai-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user, tokens: s.tokens }),
    }
  )
)

useAuthStore.subscribe((state, previous) => {
  if (state.sessionVersion !== previous.sessionVersion) for (const listener of listeners) listener()
})

/** The signed-in user's preferences with defaults filled in. */
export function usePreferences() {
  return resolvePreferences(useAuthStore((s) => s.user?.preferences))
}
