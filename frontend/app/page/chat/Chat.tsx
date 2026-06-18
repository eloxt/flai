import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "react-router";
import { ArrowDown } from "lucide-react";
import type { MetaFunction } from "react-router";

import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/chat-input";
import { useInputStore } from "@/store/input-store";
import { useConversationStore } from "@/store/conversation-store";
import { useAppStore } from "@/store/app-store";
import { useModelStore } from "@/store/model-store";

import { useChat } from "./use-chat";
import { ChatSkeleton } from "./ChatSkeleton";
import { MessageItem } from "./MessageItem";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TreeNode } from "../../types/chat";

export const meta: MetaFunction = ({ params }) => {
    const { conversationId } = params;
    let title = "FlaiChat";
    if (conversationId) {
        const conversation = useConversationStore
            .getState()
            .conversations.find((c) => c.id === conversationId);
        if (conversation) {
            title = `FlaiChat - ${conversation.title}`;
        }
    }
    return [{ title }];
};

export default function Chat() {
    const isMobile = useIsMobile();
    const { conversationId } = useParams();

    // Input state
    const setChatInput = useInputStore((state) => state.setChatInput);
    const input = useInputStore((state) =>
        conversationId ? state.chatInputs[conversationId] || "" : ""
    );
    const setInput = (value: string) => {
        if (conversationId) {
            setChatInput(conversationId, value);
        }
    };
    const attachments = useInputStore((state) => state.attachments);
    const currentModel = useModelStore((state) => state.currentModel);

    // UI state
    const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [inputHeight, setInputHeight] = useState(0);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const isPinnedToBottomRef = useRef(true);
    const setShowHeaderBorder = useAppStore((state) => state.setShowHeaderBorder);

    // Chat hook
    const {
        path,
        nodeMap,
        isLoading,
        isStreaming,
        streamingMessage,
        sendMessage,
        retryMessage,
        deleteMessage,
        cancelGeneration,
        switchNode,
    } = useChat(conversationId, useMemo(() => ({
        onExpandReasoning: (messageId: string, index: number) => {
            setExpandedReasoning((prev) => new Set(prev).add(messageId + "-" + index));
        },
        onCollapseReasoning: (messageId: string, index: number) => {
            setExpandedReasoning((prev) => {
                const label = messageId + "-" + index;
                if (!prev.has(label)) return prev; // bail out - no state change, no re-render
                const newSet = new Set(prev);
                newSet.delete(label);
                return newSet;
            });
        },
    }), []));

    // Sync message path to app store for sharing
    const setCurrentMessagePath = useAppStore((state) => state.setCurrentMessagePath);
    useEffect(() => {
        // Include streamingMessage in the path for sharing
        const fullPath = streamingMessage ? [...path, streamingMessage] : path;
        setCurrentMessagePath(fullPath);
    }, [path, streamingMessage, setCurrentMessagePath]);

    // Scroll to bottom when streaming message updates.
    // Use instant ("auto") scroll: tokens arrive in small increments, so each
    // snap is tiny and looks silky. Smooth scroll here would restart its
    // animation on every SSE event and cause visible jitter.
    useEffect(() => {
        if (!isStreaming) {
            return;
        }
        if (isPinnedToBottomRef.current) {
            scrollToBottom("auto");
        }
    }, [streamingMessage]);

    // Scroll to specific message when triggered from timeline
    const scrollToMessageId = useAppStore((state) => state.scrollToMessageId);
    const setScrollToMessageId = useAppStore((state) => state.setScrollToMessageId);
    useEffect(() => {
        if (scrollToMessageId) {
            const messageElement = document.querySelector(`[data-message-id="${scrollToMessageId}"]`);
            if (messageElement) {
                messageElement.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            // Reset the scroll target
            setScrollToMessageId(null);
        }
    }, [scrollToMessageId, setScrollToMessageId]);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
        requestAnimationFrame(() => {
            if (scrollAreaRef.current) {
                scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior });
            }
        });
    }, []);

    const handleScrollButtonClick = useCallback(() => {
        isPinnedToBottomRef.current = true;
        setShowScrollButton(false);
        scrollToBottom("smooth");
    }, [scrollToBottom]);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const isBottom = scrollHeight - scrollTop - clientHeight < 100;
        isPinnedToBottomRef.current = isBottom;
        setShowScrollButton(!isBottom);
        setShowHeaderBorder(scrollTop > 20);
    }, [setShowHeaderBorder]);

    const toggleReasoning = useCallback((messageId: string, index: number) => {
        const label = messageId + "-" + index;
        setExpandedReasoning((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(label)) {
                newSet.delete(label);
            } else {
                newSet.add(label);
            }
            return newSet;
        });
    }, []);

    const handleSend = useCallback(() => {
        if (!input.trim()) return;
        sendMessage({ text: input });
        isPinnedToBottomRef.current = true;
        scrollToBottom();
    }, [input, sendMessage, scrollToBottom]);

    const handleEdit = useCallback((message: TreeNode) => {
        const lastContent = message.content[message.content.length - 1];
        const text = (lastContent.data as { content: string }).content || "";
        setEditingMessageId(message.id);
        setEditValue(text);
    }, []);

    const handleEditCancel = useCallback(() => {
        setEditingMessageId(null);
        setEditValue("");
    }, []);

    const handleEditSubmit = useCallback(() => {
        if (!editValue.trim() || !editingMessageId) return;

        const messageIndex = path.findIndex((m) => m.id === editingMessageId);
        if (messageIndex === -1) return;

        const newPath = path.slice(0, messageIndex);

        setEditingMessageId(null);
        sendMessage({
            text: editValue,
            pathParam: newPath,
        });
        setEditValue("");
    }, [editValue, editingMessageId, path, sendMessage]);

    // Calculate context usage percentage from latest assistant message
    const contextUsagePercentage = (() => {
        if (!currentModel?.limit?.context) return undefined;

        // Check streaming message first, then fall back to last path message
        const latestMessage = streamingMessage || path[path.length - 1];
        if (!latestMessage) return undefined;
        const metaInfo = latestMessage.meta_info;
        if (!metaInfo) return undefined;
        const totalTokens = metaInfo.response_token_count;
        return Math.min((totalTokens / currentModel.limit.context) * 100, 100);
    })();

    return (
        <>
            <div
                ref={scrollAreaRef}
                className="flex-1 min-h-0 px-4 md:px-8 overflow-y-auto"
                onScroll={handleScroll}
            >
                <div className="pt-4 mx-auto max-w-7xl flex flex-col gap-8 w-full min-w-0 overflow-hidden"
                    style={{
                        paddingBottom: `${inputHeight + 128 + (attachments.length > 0 ? 36 : 0)}px`,
                    }}
                >
                    {isLoading ? (
                        <ChatSkeleton />
                    ) : (
                        <>
                            {path.map((message, messageIndex) => (
                                <MessageItem
                                    key={message.id}
                                    message={message}
                                    messageIndex={messageIndex}
                                    pathLength={path.length + (streamingMessage ? 1 : 0)}
                                    isStreaming={false}
                                    expandedReasoning={expandedReasoning}
                                    nodeMap={nodeMap}
                                    previousMessageId={messageIndex > 0 ? path[messageIndex - 1].id : undefined}
                                    onToggleReasoning={toggleReasoning}
                                    onSwitchNode={switchNode}
                                    onRetry={retryMessage}
                                    onDelete={deleteMessage}
                                    isEditing={editingMessageId === message.id}
                                    editValue={editingMessageId === message.id ? editValue : ""}
                                    onEdit={handleEdit}
                                    onEditChange={setEditValue}
                                    onEditSubmit={handleEditSubmit}
                                    onEditCancel={handleEditCancel}
                                />
                            ))}
                            {/* Streaming message rendered separately - only this re-renders during streaming */}
                            {streamingMessage && (
                                <MessageItem
                                    key={streamingMessage.id}
                                    message={streamingMessage}
                                    messageIndex={path.length}
                                    pathLength={path.length + 1}
                                    isStreaming={isStreaming}
                                    expandedReasoning={expandedReasoning}
                                    nodeMap={nodeMap}
                                    previousMessageId={path.length > 0 ? path[path.length - 1].id : undefined}
                                    onToggleReasoning={toggleReasoning}
                                    onSwitchNode={switchNode}
                                    onRetry={retryMessage}
                                    onDelete={deleteMessage}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className={`absolute ${isMobile ? "bottom-8" : "bottom-4"} left-0 right-0 z-50 px-4 md:px-8 pointer-events-none `}>
                <div
                    className={`absolute left-1/2 -translate-x-1/2 mb-4 transition-opacity ${showScrollButton
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none"
                        }`}
                    style={{
                        bottom: `${inputHeight + 70 + (attachments.length > 0 ? 48 : 0)}px`,
                    }}
                >
                    <Button
                        variant="outline"
                        size="icon"
                        className="rounded-full shadow-lg bg-background/60 backdrop-blur-sm hover:bg-background"
                        onClick={handleScrollButtonClick}
                    >
                        <ArrowDown className="size-4" />
                    </Button>
                </div>
                <div className="mx-auto max-w-7xl pointer-events-auto bg-background">
                    <ChatInput
                        value={input}
                        onChange={setInput}
                        onSend={handleSend}
                        onCancel={cancelGeneration}
                        isStreaming={isStreaming}
                        onHeightChange={setInputHeight}
                        autoFocus={true}
                        contextUsagePercentage={contextUsagePercentage}
                    />
                </div>
            </div>
            <div className={`absolute bottom-0 left-0 right-0 ${isMobile ? "h-8" : "h-4"} z-40 mx-4 md:mx-8 bg-background`} />
        </>
    );
}
