import { Outlet } from "react-router"
import { ChatHeader } from "~/components/chat-header"
import { AppSidebar } from "~/components/sidebar/app-sidebar"
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar"
import { useAppStore } from "~/store/app-store"

export default function AppLayout() {
  const sidebarOpen = useAppStore((s) => s.isSidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="h-dvh overflow-hidden"
    >
      <AppSidebar />
      <SidebarInset className="h-dvh min-h-0 min-w-0 overflow-hidden md:h-[calc(100dvh-1rem)]">
        <div aria-hidden="true" className="material-grid pointer-events-none absolute inset-x-0 top-0 h-90" />
        <ChatHeader />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
