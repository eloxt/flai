import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthUser, TokenPair } from "../lib/auth-client";

import { useInputStore } from "./input-store";
import { useConversationStore } from "./conversation-store";
import { useAppStore } from "./app-store";
import { useModelStore } from "./model-store";
import { useTranslateStore } from "./translate-store";

interface AuthState {
  sessionVersion: number;
  user: AuthUser | null;
  tokens: TokenPair | null;
  expiresAt: Date | null;
  login: (data: { user?: AuthUser; token?: TokenPair }) => void;
  logout: () => void;
  updateUser: (user: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      sessionVersion: 0,
      user: null,
      tokens: null,
      expiresAt: null,
      login: (data: { user?: AuthUser; token?: TokenPair }) => {
        set({
          sessionVersion: get().sessionVersion + 1,
          user: data.user || null,
          tokens: data.token || null,
          expiresAt: new Date(new Date().getTime() + (data.token?.expires_in ?? 0) * 1000),
        });
      },
      logout: () => {
        set({
          sessionVersion: get().sessionVersion + 1,
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

useAuthStore.subscribe((state, previous) => {
  if (state.sessionVersion === previous.sessionVersion) return;
  useInputStore.setState(useInputStore.getInitialState());
  useConversationStore.setState(useConversationStore.getInitialState());
  useModelStore.setState(useModelStore.getInitialState());
  useTranslateStore.setState(useTranslateStore.getInitialState());
  useAppStore.setState({ currentMessagePath: [], currentMessageTree: new Map(), isChatStreaming: false, scrollToMessageId: null, dismissedNotifications: [], isInspectionPanelOpen: false });
});
