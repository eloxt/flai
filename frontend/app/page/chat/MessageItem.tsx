import { useEffect, useState } from "react";
import type { TreeNode, ContentMessage } from "../../types/chat";
import { MessageContent } from "./MessageContent";
import { MessageAttachments } from "./MessageAttachments";
import { MessageActions } from "./MessageActions";
import { GoogleGroundingChunks, OpenaiGroundingChunks } from "./GroundingChunks";

interface MessageItemProps {
    message: TreeNode;
    messageIndex: number;
    pathLength: number;
    isStreaming: boolean;
    expandedReasoning: Set<string>;
    nodeMap: Map<string, TreeNode>;
    previousMessageId?: string;
    onToggleReasoning: (messageId: string) => void;
    onSwitchNode: (message: TreeNode, isNext: boolean) => void;
    onRetry: (message: TreeNode) => void;
    onDelete: () => void;
}

export function MessageItem({
    message,
    messageIndex,
    pathLength,
    isStreaming,
    expandedReasoning,
    nodeMap,
    previousMessageId,
    onToggleReasoning,
    onSwitchNode,
    onRetry,
    onDelete,
}: MessageItemProps) {
    const [streamed, setStreamed] = useState(false);

    const isLastMessage = messageIndex === pathLength - 1;

    const shouldExpandToFillViewport = isLastMessage && message.role === "assistant" && streamed;

    const [dynamicMinHeight, setDynamicMinHeight] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (shouldExpandToFillViewport && previousMessageId) {
            const previousMessageElement = document.querySelector(
                `[data-message-id="${previousMessageId}"]`
            );
            if (previousMessageElement) {
                const previousMessageHeight = previousMessageElement.getBoundingClientRect().height;
                const calculatedHeight = window.innerHeight - previousMessageHeight - 32 - 240;
                setDynamicMinHeight(`${calculatedHeight}px`);
            }
        } else {
            setDynamicMinHeight(undefined);
        }
    }, [shouldExpandToFillViewport, previousMessageId, window.innerHeight]);

    useEffect(() => {
        if (isStreaming) {
            setStreamed(true);
        }
    }, [isStreaming]);

    return (
        <div
            key={message.id}
            data-message-id={message.id}
            className="flex flex-col gap-2 group min-w-0 w-full"
            style={{
                minHeight: dynamicMinHeight,
            }}
        >
            {message.content !== null &&
                message.content.map((content, index) => (
                    <div
                        key={index}
                        className={`flex flex-col min-w-0 ${message.role === "user" ? "self-end items-end" : "self-start items-start"
                            }`}
                        style={{
                            maxWidth: message.role === "user" ? "80%" : "100%",
                        }}
                    >
                        {/* Files/Attachments */}
                        {content.type === "message" &&
                            (content.data as ContentMessage).files &&
                            (content.data as ContentMessage).files!.length > 0 && (
                                <MessageAttachments
                                    files={(content.data as ContentMessage).files!}
                                />
                            )}

                        {/* Content */}
                        <div
                            className={`px-4 rounded-2xl min-w-0 ${message.role === "user"
                                ? "bg-(--color-user-msg-bg) py-2"
                                : "w-full"
                                }`}
                        >
                            <MessageContent
                                content={content}
                                contentIndex={index}
                                messageId={message.id}
                                role={message.role as "user" | "assistant"}
                                isLastMessage={isLastMessage}
                                isLastContent={index === message.content.length - 1}
                                isStreaming={isStreaming}
                                isExpanded={expandedReasoning.has(message.id)}
                                onToggleReasoning={() => onToggleReasoning(message.id)}
                            />
                        </div>
                    </div>
                ))}

            {/* Google Grounding Chunks */}
            {message.meta_info?.google_grounding_data?.groundingChunks &&
                message.meta_info.google_grounding_data.groundingChunks.length > 0 && (
                    <GoogleGroundingChunks
                        chunks={message.meta_info.google_grounding_data.groundingChunks}
                        searchEntryPoint={
                            message.meta_info.google_grounding_data.searchEntryPoint
                        }
                    />
                )}

            {/* OpenAI Grounding Data */}
            {message.meta_info?.openai_grounding_data && (
                <OpenaiGroundingChunks
                    groundingData={message.meta_info.openai_grounding_data}
                />
            )}

            {/* Actions */}
            <MessageActions
                message={message}
                messageIndex={messageIndex}
                pathLength={pathLength}
                isStreaming={isStreaming}
                nodeMap={nodeMap}
                onSwitchNode={onSwitchNode}
                onRetry={onRetry}
                onDelete={onDelete}
            />
        </div>
    );
}
