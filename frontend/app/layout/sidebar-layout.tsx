import { Outlet } from "react-router";
import Sidebar from "../components/sidebar";
import InspectionPanel from "../components/inspection-panel";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAppStore } from "../store/app-store";
import ChatHeader from "@/components/chat-header";

export default function SidebarLayout() {
    const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);
    const isInspectionPanelOpen = useAppStore((state) => state.isInspectionPanelOpen);
    const currentMessagePath = useAppStore((state) => state.currentMessagePath)

    return (
        <div className="flex">
            <SidebarProvider
                defaultOpen={isSidebarOpen}
                className="w-fit"
            >
                <Sidebar />
            </SidebarProvider>

            <SidebarInset className="max-h-dvh overflow-hidden">
                <ChatHeader />
                <Outlet />
            </SidebarInset>

            <SidebarProvider
                defaultOpen={isInspectionPanelOpen}
                className="w-fit"
                style={{
                    "--sidebar-width": "20rem",
                }}
            >
                <InspectionPanel messagePath={currentMessagePath} />
            </SidebarProvider>
        </div>
    );
}
