import { useEffect, useState, useRef } from "react";
import type { TreeNode, ContentMessage } from "../../types/chat";
import { MessageContent } from "./MessageContent";
import { MessageAttachments } from "./MessageAttachments";
import { MessageActions } from "./MessageActions";
import { GoogleGroundingChunks, OpenaiGroundingChunks } from "./GroundingChunks";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { t } from "i18next";
import { Check, X } from "lucide-react";

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
    isEditing?: boolean;
    editValue?: string;
    onEdit?: (message: TreeNode) => void;
    onEditChange?: (value: string) => void;
    onEditSubmit?: () => void;
    onEditCancel?: () => void;
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
    isEditing,
    editValue,
    onEdit,
    onEditChange,
    onEditSubmit,
    onEditCancel,
}: MessageItemProps) {
    const [streamed, setStreamed] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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

    // Auto-focus textarea when entering edit mode
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            // Move cursor to end
            textareaRef.current.selectionStart = textareaRef.current.value.length;
        }
    }, [isEditing]);

    // Handle keyboard shortcuts in edit mode
    const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Escape") {
            onEditCancel?.();
        } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onEditSubmit?.();
        }
    };

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

                        {isEditing && message.role === "user" ? (
                            <div className="flex flex-col gap-2 p-2">
                                <Textarea
                                    ref={textareaRef}
                                    value={editValue}
                                    onChange={(e) => onEditChange?.(e.target.value)}
                                    onKeyDown={handleEditKeyDown}
                                    className="w-full min-w-64 resize-none"
                                />
                                <div className="flex gap-2 justify-end">
                                    <Button
                                        onClick={onEditCancel}
                                        variant="outline"
                                    >
                                        <X />
                                        {t("common.actions.cancel")}
                                    </Button>
                                    <Button
                                        onClick={onEditSubmit}
                                        variant="outline"
                                    >
                                        <Check />
                                        {t("common.actions.confirm")}
                                    </Button>
                                </div>
                            </div>
                        ) : (
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
                        )}
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
            {!isEditing && (
                <MessageActions
                    message={message}
                    messageIndex={messageIndex}
                    pathLength={pathLength}
                    isStreaming={isStreaming}
                    nodeMap={nodeMap}
                    onSwitchNode={onSwitchNode}
                    onRetry={onRetry}
                    onDelete={onDelete}
                    onEdit={onEdit}
                />
            )}
        </div>
    );
}
