import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router";
import { ArrowDown } from "lucide-react";
import type { MetaFunction } from "react-router";

import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/chat-input";
import { useInputStore } from "@/store/input-store";
import { useConversationStore } from "@/store/conversation-store";
import { useAppStore } from "@/store/app-store";

import { useChat } from "./use-chat";
import { ChatSkeleton } from "./ChatSkeleton";
import { MessageItem } from "./MessageItem";

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

    // UI state
    const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());
    const [showScrollButton, setShowScrollButton] = useState(true);
    const [inputHeight, setInputHeight] = useState(0);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const setShowHeaderBorder = useAppStore((state) => state.setShowHeaderBorder);

    // Chat hook
    const {
        path,
        nodeMap,
        isLoading,
        isStreaming,
        sendMessage,
        retryMessage,
        deleteMessage,
        switchNode,
    } = useChat(conversationId, {
        onExpandReasoning: (messageId) => {
            setExpandedReasoning((prev) => new Set(prev).add(messageId));
        },
        onCollapseReasoning: (messageId) => {
            setExpandedReasoning((prev) => {
                const newSet = new Set(prev);
                newSet.delete(messageId);
                return newSet;
            });
        },
    });

    // Sync message path to app store for sharing
    const setCurrentMessagePath = useAppStore((state) => state.setCurrentMessagePath);
    useEffect(() => {
        setCurrentMessagePath(path);
    }, [path, setCurrentMessagePath]);

    // Scroll to bottom when path changes
    useEffect(() => {
        if (!showScrollButton) {
            scrollToBottom();
        }
    }, [path]);

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

    const scrollToBottom = () => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: "smooth" });
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const isBottom = scrollHeight - scrollTop - clientHeight < 500;
        setShowScrollButton(!isBottom);
        setShowHeaderBorder(scrollTop > 20);
    };

    const toggleReasoning = (messageId: string) => {
        setExpandedReasoning((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(messageId)) {
                newSet.delete(messageId);
            } else {
                newSet.add(messageId);
            }
            return newSet;
        });
    };

    const handleSend = () => {
        if (!input.trim()) return;
        sendMessage({ text: input });
        scrollToBottom();
    };

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
                        path.map((message, messageIndex) => (
                            <MessageItem
                                key={message.id}
                                message={message}
                                messageIndex={messageIndex}
                                pathLength={path.length}
                                isStreaming={isStreaming && message.id === path[path.length - 1].id}
                                expandedReasoning={expandedReasoning}
                                nodeMap={nodeMap}
                                previousMessageId={messageIndex > 0 ? path[messageIndex - 1].id : undefined}
                                onToggleReasoning={toggleReasoning}
                                onSwitchNode={switchNode}
                                onRetry={retryMessage}
                                onDelete={deleteMessage}
                            />
                        ))
                    )}
                </div>
            </div>

            <div className="absolute bottom-4 left-0 right-0 z-50 px-4 md:px-8 pointer-events-none">
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
                        onClick={scrollToBottom}
                    >
                        <ArrowDown className="size-4" />
                    </Button>
                </div>
                <div className="mx-auto max-w-7xl pointer-events-auto bg-background">
                    <ChatInput
                        value={input}
                        onChange={setInput}
                        onSend={handleSend}
                        onHeightChange={setInputHeight}
                        autoFocus={true}
                    />
                </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-4 z-40 mx-4 md:mx-8 bg-background" />
        </>
    );
}
