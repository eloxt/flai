import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { onSessionChange } from "./auth-store"

interface AppState {
  isSidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  dismissedNotifications: string[]
  dismissNotification: (id: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isSidebarOpen: true,
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),
      dismissedNotifications: [],
      dismissNotification: (id) =>
        set((s) => ({
          dismissedNotifications: s.dismissedNotifications.includes(id)
            ? s.dismissedNotifications
            : [...s.dismissedNotifications, id],
        })),
    }),
    {
      name: "flai-app",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        isSidebarOpen: s.isSidebarOpen,
        dismissedNotifications: s.dismissedNotifications,
      }),
    }
  )
)

onSessionChange(() => useAppStore.setState({ dismissedNotifications: [] }))
