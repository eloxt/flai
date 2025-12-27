import { Outlet } from "react-router";
import Sidebar from "../components/sidebar";
import ModelSelector from "../components/model-selector";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAppStore } from "../store/app-store";

export default function SidebarLayout() {
    const isSidebarCollapsed = useAppStore((state) => state.isSidebarCollapsed);
    const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);

    return (
        <SidebarProvider defaultOpen={!isSidebarCollapsed} open={!isSidebarCollapsed} onOpenChange={(open) => setSidebarCollapsed(!open)}>
            <Sidebar />
            <SidebarInset className="h-svh overflow-hidden">
                <ModelSelector />
                <Outlet />
            </SidebarInset>
        </SidebarProvider>
    );
}
