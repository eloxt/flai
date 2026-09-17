import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { Background, Controls, ReactFlow, useNodesInitialized, useReactFlow, useStore, type Edge, type Node } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { GitBranch, Bot } from "lucide-react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Sidebar, SidebarContent, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { ROOT_NODE_ID } from "@/page/chat/use-chat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/auth-store";
import { useAppStore } from "@/store/app-store";
import type { TreeNode, ContentMessage } from "@/types/chat";
import "@xyflow/react/dist/style.css";

const nodeWidth = 320;
const nodeHeight = 106;
const fitViewOptions = { padding: 0.2, minZoom: 0.02, maxZoom: 1 };

// React Flow's initial fit can run before the resizable panel has its final size.
function InitialTreeViewport() {
    const initialized = useNodesInitialized({ includeHiddenNodes: true });
    const width = useStore(state => state.width);
    const height = useStore(state => state.height);
    const { fitView } = useReactFlow();
    const fittedSize = useRef("");

    useEffect(() => {
        if (!initialized || width <= 0 || height <= 0) return;
        const size = `${width}:${height}`;
        if (fittedSize.current === size) return;

        // Debounce panel measurement/resize; don't refit on streamed text or panning.
        const timer = window.setTimeout(() => {
            void fitView(fitViewOptions);
            fittedSize.current = size;
        }, 100);
        return () => window.clearTimeout(timer);
    }, [initialized, width, height, fitView]);

    return null;
}

interface InspectionPanelProps {
    messagePath: TreeNode[];
}

export default function InspectionPanel({ messagePath }: InspectionPanelProps) {
    const { t } = useTranslation();
    const { conversationId } = useParams();
    const user = useAuthStore(state => state.user);
    const isInspectionPanelOpen = useAppStore((state) => state.isInspectionPanelOpen);
    const nodeMap = useAppStore((state) => state.currentMessageTree);
    const isStreaming = useAppStore((state) => state.isChatStreaming);
    const setScrollToMessageId = useAppStore((state) => state.setScrollToMessageId);
    const { setOpen, isMobile, setOpenMobile } = useSidebar();

    useEffect(() => {
        if (isMobile) setOpenMobile(isInspectionPanelOpen);
        else setOpen(isInspectionPanelOpen);
    }, [isInspectionPanelOpen, isMobile, setOpen, setOpenMobile]);

    // Layout only changes with the tree, not with streamed text or path selection.
    const layout = useMemo(() => {
        const messages = [...nodeMap.values()].filter(message => message.id !== ROOT_NODE_ID);
        const ids = new Set(messages.map(message => message.id));
        const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
        graph.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 88 });
        for (const message of messages) graph.setNode(message.id, { width: nodeWidth, height: nodeHeight });
        for (const message of messages) {
            if (ids.has(message.parent_id)) graph.setEdge(message.parent_id, message.id);
        }
        dagre.layout(graph);
        return messages.map(message => ({
            message,
            position: { x: graph.node(message.id).x - nodeWidth / 2, y: graph.node(message.id).y - nodeHeight / 2 },
        }));
    }, [nodeMap]);

    const { nodes, edges } = useMemo(() => {
        const activePath = new Map(messagePath.map(message => [message.id, message]));
        const ids = new Set(layout.map(({ message }) => message.id));
        const edges: Edge[] = [];
        const nodes: Node[] = layout.map(({ message: storedMessage, position }) => {
            const message = activePath.get(storedMessage.id) ?? storedMessage;
            const active = activePath.has(message.id);
            const disabled = isStreaming && !active;
            const role = t(`components.inspectionPanel.${message.role}`, message.role);
            const name = message.role === "user"
                ? user?.username || role
                : message.meta_info?.model_name || role;
            const text = message.content?.filter(content => content.type === "message")
                .map(content => (content.data as ContentMessage).content).join(" ").trim();
            const preview = text || t("components.inspectionPanel.nonText");
            if (ids.has(message.parent_id)) {
                const activeEdge = active && activePath.has(message.parent_id);
                edges.push({
                    id: `${message.parent_id}-${message.id}`,
                    source: message.parent_id, target: message.id, type: "smoothstep",
                    style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5, strokeDasharray: "6 6", opacity: activeEdge ? 1 : 0.45 },
                });
            }
            return {
                id: message.id, position, width: nodeWidth, height: nodeHeight,
                className: "shadow-sm",
                style: {
                    width: nodeWidth, height: nodeHeight, padding: 0,
                    // Read-only nodes still contain interactive navigation buttons.
                    pointerEvents: "all",
                    background: "var(--card)",
                    color: "var(--foreground)",
                    border: `1px solid ${active ? "color-mix(in oklch, var(--foreground) 10%, var(--border))" : "var(--border)"}`,
                    borderRadius: 16,
                },
                focusable: false,
                data: { label: (
                    <button
                        type="button"
                        className="nodrag nopan flex size-full cursor-pointer items-start gap-3 rounded-[inherit] p-4 text-left outline-offset-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={disabled}
                        aria-label={`${name}: ${preview.slice(0, 160)}`}
                        aria-current={active ? "true" : undefined}
                        title={disabled ? t("components.inspectionPanel.streaming") : preview.slice(0, 500)}
                        onClick={() => {
                            setScrollToMessageId(message.id);
                            if (isMobile) {
                                setOpenMobile(false);
                                useAppStore.setState({ isInspectionPanelOpen: false });
                            }
                        }}
                    >
                        {message.role === "user" ? (
                            <Avatar className="mt-0.5 size-7">
                                <AvatarImage src={user?.avatar} alt={name} />
                                <AvatarFallback style={{ background: "var(--chart-1)", color: "var(--background)" }}>
                                    {name.slice(0, 1).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                        ) : (
                            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 text-foreground">
                                <Bot className="size-4" />
                            </span>
                        )}
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="truncate text-base font-medium leading-5" title={name}>{name}</span>
                            <span className="line-clamp-2 break-words text-sm leading-5 text-muted-foreground">{preview.slice(0, 160)}</span>
                        </span>
                    </button>
                ) },
            };
        });
        return { nodes, edges };
    }, [layout, messagePath, isStreaming, user, t, setScrollToMessageId, isMobile, setOpenMobile]);

    return (
        <Sidebar side="right" collapsible={isMobile ? "offcanvas" : "none"}>
            <SidebarHeader className="bg-background">
                <div className="flex items-center gap-2 px-2 py-1">
                    <GitBranch className="size-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{t("components.inspectionPanel.title")}</span>
                </div>
            </SidebarHeader>
            <SidebarContent className="overflow-hidden bg-background">
                {nodes.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">{t("components.inspectionPanel.empty")}</p>
                ) : (
                    <div className="min-h-0 flex-1" style={{
                        "--xy-background-color": "var(--background)",
                        "--xy-controls-button-background-color-default": "var(--background)",
                        "--xy-controls-button-background-color-hover-default": "var(--muted)",
                        "--xy-controls-button-color-default": "var(--foreground)",
                        "--xy-controls-button-border-color-default": "var(--border)",
                        "--xy-handle-background-color-default": "var(--foreground)",
                        "--xy-handle-border-color-default": "var(--background)",
                    } as CSSProperties}>
                        <ReactFlow
                            key={conversationId}
                            nodes={nodes} edges={edges}
                            minZoom={0.02} maxZoom={1.5}
                            nodesDraggable={false} nodesConnectable={false}
                            elementsSelectable={false} edgesFocusable={false}
                            deleteKeyCode={null}
                        >
                            <InitialTreeViewport />
                            <Background color="var(--border)" gap={16} />
                            <Controls showInteractive={false} fitViewOptions={fitViewOptions} />
                        </ReactFlow>
                    </div>
                )}
            </SidebarContent>
        </Sidebar>
    );
}
