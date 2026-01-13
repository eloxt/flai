import { create } from "zustand";
import {
  createJSONStorage,
  persist,
} from "zustand/middleware";
import type { TreeNode } from "@/page/chat/types";

interface AppState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  showHeaderBorder: boolean;
  setShowHeaderBorder: (show: boolean) => void;
  currentMessagePath: TreeNode[];
  setCurrentMessagePath: (path: TreeNode[]) => void;
  isInspectionPanelOpen: boolean;
  toggleInspectionPanel: () => void;
  scrollToMessageId: string | null;
  setScrollToMessageId: (id: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isSidebarOpen: true,
      toggleSidebar: () =>
        set((state) => ({
          isSidebarOpen: !state.isSidebarOpen,
        })),
      showHeaderBorder: false,
      setShowHeaderBorder: (show) => set({ showHeaderBorder: show }),
      currentMessagePath: [],
      setCurrentMessagePath: (path) => set({ currentMessagePath: path }),
      isInspectionPanelOpen: false,
      toggleInspectionPanel: () =>
        set((state) => ({
          isInspectionPanelOpen: !state.isInspectionPanelOpen,
        })),
      scrollToMessageId: null,
      setScrollToMessageId: (id) => set({ scrollToMessageId: id }),
    }),
    {
      name: "flai-app-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isSidebarOpen: state.isSidebarOpen,
        isRightSidebarOpen: state.isInspectionPanelOpen,
      }),
    }
  )
);
