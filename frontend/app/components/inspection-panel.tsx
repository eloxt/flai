import { Sidebar, SidebarContent, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";
import { User, Clock } from "lucide-react";
import type { TreeNode, ContentMessage } from "@/types/chat";
import { useAppStore } from "@/store/app-store";
import { useEffect } from "react";

interface InspectionPanelProps {
    messagePath: TreeNode[];
}

function formatTime(date: Date): string {
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date: Date): string {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
        return "Today";
    } else if (d.toDateString() === yesterday.toDateString()) {
        return "Yesterday";
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getMessagePreview(message: TreeNode): string {
    const firstContent = message.content?.[0];
    if (!firstContent) return "";

    if (firstContent.type === "message") {
        const content = (firstContent.data as ContentMessage).content;
        return content.length > 100 ? content.substring(0, 100) + "..." : content;
    }
    return "";
}

export default function InspectionPanel({ messagePath }: InspectionPanelProps) {
    const { t } = useTranslation();
    const isInspectionPanelOpen = useAppStore((state) => state.isInspectionPanelOpen);
    const setScrollToMessageId = useAppStore((state) => state.setScrollToMessageId);
    const { open, setOpen, toggleSidebar } = useSidebar();

    // Filter to only show user and assistant messages with actual content
    const userMessages = messagePath.filter(
        (msg) => msg.role === "user" && msg.content?.[0]?.type === "message"
    );

    const handleNodeClick = (messageId: string) => {
        setScrollToMessageId(messageId);
    };

    useEffect(() => {
        if (isInspectionPanelOpen !== open) {
            toggleSidebar();
            setOpen(isInspectionPanelOpen);
        }
    }, [isInspectionPanelOpen]);

    return (
        <Sidebar side="right">
            <SidebarHeader className="bg-background">
                <div className="flex items-center gap-2 px-2 py-1">
                    <Clock className="size-4 text-muted-foreground" />
                    <span className="font-semibold text-sm">
                        {t("components.inspectionPanel.title", "Timeline")}
                    </span>
                </div>
            </SidebarHeader>
            <SidebarContent className="bg-background">
                <ScrollArea className="h-full">
                    <div className="p-4">
                        {userMessages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                <Clock className="size-8 mb-2 opacity-50" />
                                <p className="text-sm text-center">
                                    {t("components.inspectionPanel.empty", "No messages yet")}
                                </p>
                            </div>
                        ) : (
                            <div className="relative">
                                {/* Timeline line */}
                                <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-linear-to-b from-primary/50 via-primary/30 to-transparent" />

                                {/* Timeline items */}
                                <div className="flex flex-col gap-4">
                                    {userMessages.map((message) => {
                                        return (
                                            <div
                                                key={message.id}
                                                className="relative pl-8 cursor-pointer"
                                                onClick={() => handleNodeClick(message.id)}
                                            >
                                                {/* Timeline dot */}
                                                <div className="absolute left-0 top-0 flex items-center justify-center">
                                                    <div className="relative">
                                                        <div className="size-6 rounded-full bg-background flex items-center justify-center border">
                                                            <User className="size-3 text-primary" />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Content card */}
                                                <div className="group relative bg-card rounded-lg border border-border/50 p-3">
                                                    {/* Header with time */}
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-medium text-muted-foreground">
                                                            {formatDate(message.created_at)} · {formatTime(message.created_at)}
                                                        </span>
                                                    </div>

                                                    {/* User message preview */}
                                                    <p className="text-sm text-foreground line-clamp-3 mb-2">
                                                        {getMessagePreview(message)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* End marker */}
                                <div className="relative pl-8 mt-4">
                                    <div className="absolute left-2 top-0 flex items-center justify-center">
                                        <div className="size-2 rounded-full bg-muted-foreground/30" />
                                    </div>
                                    <p className="text-xs text-muted-foreground italic">
                                        {t("components.inspectionPanel.end", "End of conversation")}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </SidebarContent>
        </Sidebar>
    );
}
