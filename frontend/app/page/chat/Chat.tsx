import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router";
import { ArrowDown } from "lucide-react";
import type { MetaFunction } from "react-router";

import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/chat-input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [inputHeight, setInputHeight] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
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
        setCurrentMessagePath(path.map((msg) => msg.id));
    }, [path, setCurrentMessagePath]);

    // Scroll to bottom when path changes
    useEffect(() => {
        if (!showScrollButton) {
            scrollToBottom();
        }
    }, [path]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const isBottom = scrollHeight - scrollTop - clientHeight < 200;
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
    };

    return (
        <>
            <ScrollArea
                className="flex-1 px-4 pb-0 overflow-y-hidden h-full"
                onScroll={handleScroll}
                style={{
                    paddingBottom: `${inputHeight + 66 + (attachments.length > 0 ? 36 : 0)}px`,
                }}
            >
                <div className="pt-4 mx-auto max-w-5xl flex flex-col gap-8 w-full min-w-0 overflow-hidden">
                    {isLoading ? (
                        <ChatSkeleton />
                    ) : (
                        path.map((message, messageIndex) => (
                            <MessageItem
                                key={message.id}
                                message={message}
                                messageIndex={messageIndex}
                                pathLength={path.length}
                                isStreaming={isStreaming}
                                expandedReasoning={expandedReasoning}
                                nodeMap={nodeMap}
                                onToggleReasoning={toggleReasoning}
                                onSwitchNode={switchNode}
                                onRetry={retryMessage}
                                onDelete={deleteMessage}
                            />
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <ScrollBar orientation="horizontal" />
            </ScrollArea>

            <div className="absolute bottom-4 left-0 right-0 z-50 px-4 pointer-events-none">
                <div
                    className={`absolute left-1/2 mb-4 transition-opacity duration-200 ${showScrollButton
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
                <div className="mx-auto max-w-5xl pointer-events-auto bg-background">
                    <ChatInput
                        value={input}
                        onChange={setInput}
                        onSend={handleSend}
                        onHeightChange={setInputHeight}
                        autoFocus={true}
                    />
                </div>
            </div>
        </>
    );
}
