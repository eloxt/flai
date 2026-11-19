import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { onSessionChange } from "./auth-store"

interface AppState {
  isSidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  dismissedNotifications: string[]
  dismissNotification: (id: string) => void
  /** Kept per device, since the browser permission it depends on is too. */
  browserNotifications: boolean
  setBrowserNotifications: (enabled: boolean) => void
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
      browserNotifications: true,
      setBrowserNotifications: (enabled) => set({ browserNotifications: enabled }),
    }),
    {
      name: "flai-app",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        isSidebarOpen: s.isSidebarOpen,
        dismissedNotifications: s.dismissedNotifications,
        browserNotifications: s.browserNotifications,
      }),
    }
  )
)

onSessionChange(() => useAppStore.setState({ dismissedNotifications: [] }))
