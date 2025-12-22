import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";

interface AppState {
  isSidebarCollapsed: boolean;
  isUserMenuOpen: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleUserMenu: () => void;
  closeUserMenu: () => void;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      isSidebarCollapsed: false,
      isUserMenuOpen: false,
      toggleSidebar: () =>
        set((state) => ({
          isSidebarCollapsed: !state.isSidebarCollapsed,
        })),
      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
      toggleUserMenu: () =>
        set((state) => ({ isUserMenuOpen: !state.isUserMenuOpen })),
      closeUserMenu: () => {
        if (get().isUserMenuOpen) {
          set({ isUserMenuOpen: false });
        }
      },
    }),
    {
      name: "flai-app-store",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? noopStorage : window.localStorage
      ),
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
      }),
    }
  )
);
