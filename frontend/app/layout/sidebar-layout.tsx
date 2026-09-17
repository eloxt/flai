import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/use-mobile";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Outlet } from "react-router";
import Sidebar from "../components/sidebar";
import InspectionPanel from "../components/inspection-panel";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAppStore } from "../store/app-store";
import ChatHeader from "@/components/chat-header";
import "@fontsource/iosevka";
import "@fontsource/ibm-plex-sans";

export default function SidebarLayout() {
    const { t } = useTranslation();
    const isMobile = useIsMobile();
    const inspectionWidth = useRef(320);
    const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);
    const isInspectionPanelOpen = useAppStore((state) => state.isInspectionPanelOpen);
    const currentMessagePath = useAppStore((state) => state.currentMessagePath);

    const inspectionPanel = (
        <SidebarProvider
            defaultOpen={isInspectionPanelOpen}
            className={isMobile ? "w-fit" : "h-full min-h-0 w-full"}
            style={{ "--sidebar-width": "100%" } as React.CSSProperties}
        >
            <InspectionPanel messagePath={currentMessagePath} />
        </SidebarProvider>
    );

    return (
        <div className="flex h-dvh overflow-hidden">
            <SidebarProvider defaultOpen={isSidebarOpen} className="w-fit">
                <Sidebar />
            </SidebarProvider>

            <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
                <ResizablePanel id="chat" minSize="40%">
                    <SidebarInset className="h-full min-w-0 overflow-hidden">
                        <ChatHeader />
                        <Outlet />
                    </SidebarInset>
                </ResizablePanel>
                {!isMobile && isInspectionPanelOpen && (
                    <>
                        <ResizableHandle
                            withHandle
                            aria-label={t("components.inspectionPanel.resize")}
                        />
                        <ResizablePanel
                            id="inspection"
                            defaultSize={`${inspectionWidth.current}px`}
                            minSize="240px"
                            maxSize="60%"
                            groupResizeBehavior="preserve-pixel-size"
                            onResize={(size) => { inspectionWidth.current = size.inPixels; }}
                        >
                            {inspectionPanel}
                        </ResizablePanel>
                    </>
                )}
            </ResizablePanelGroup>
            {isMobile && inspectionPanel}
        </div>
    );
}
