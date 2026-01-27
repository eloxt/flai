import { useState, ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
} from "@/components/ui/sidebar";

export interface PanelTab {
    id: string;
    label: string;
    icon: LucideIcon;
    component: ReactNode;
}

interface PanelLayoutProps {
    title: string;
    tabs: PanelTab[];
    defaultTab?: string;
}

export function PanelLayout({ title, tabs, defaultTab }: PanelLayoutProps) {
    const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || "");

    const activeComponent = tabs.find((tab) => tab.id === activeTab)?.component;

    return (
        <SidebarProvider
            defaultOpen={true}
            style={{
                "--sidebar-width": "16rem",
            } as React.CSSProperties}
        >
            <div className="flex h-full w-full bg-background text-foreground">
                <Sidebar collapsible="none" className="border-r">
                    <SidebarHeader className="p-4">
                        <h2 className="text-lg font-semibold tracking-tight">
                            {title}
                        </h2>
                    </SidebarHeader>
                    <SidebarContent>
                        <SidebarGroup>
                            <SidebarMenu>
                                {tabs.map((tab) => (
                                    <SidebarMenuItem key={tab.id}>
                                        <SidebarMenuButton
                                            isActive={activeTab === tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                        >
                                            <tab.icon className="size-4" />
                                            <span>{tab.label}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroup>
                    </SidebarContent>
                </Sidebar>

                {/* Right Content */}
                <main className="flex-1 min-w-0">
                    <ScrollArea className="h-[85vh]">
                        <div className="p-6 pt-8 max-w-4xl space-y-8">
                            {activeComponent}
                        </div>
                    </ScrollArea>
                </main>
            </div>
        </SidebarProvider>
    );
}
