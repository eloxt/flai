import { create } from "zustand";
import {
  createJSONStorage,
  persist,
} from "zustand/middleware";

interface AppState {
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  showHeaderBorder: boolean;
  setShowHeaderBorder: (show: boolean) => void;
  currentMessagePath: string[];
  setCurrentMessagePath: (path: string[]) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({
          isSidebarCollapsed: !state.isSidebarCollapsed,
        })),
      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
      showHeaderBorder: false,
      setShowHeaderBorder: (show) => set({ showHeaderBorder: show }),
      currentMessagePath: [],
      setCurrentMessagePath: (path) => set({ currentMessagePath: path }),
    }),
    {
      name: "flai-app-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
      }),
    }
  )
);
