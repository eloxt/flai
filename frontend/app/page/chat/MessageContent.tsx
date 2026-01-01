import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Streamdown } from "streamdown";
import type { Content, ContentMessage, ContentReasoning, ContentToolCall, ContentToolResult } from "./types";
import { ToolCallItem, ToolResultItem } from "./ToolCallContent";

interface MessageContentProps {
    content: Content;
    contentIndex: number;
    messageId: string;
    isLastMessage: boolean;
    isLastContent: boolean;
    isStreaming: boolean;
    isExpanded: boolean;
    onToggleReasoning: () => void;
}

export function MessageContent({
    content,
    messageId,
    isLastMessage,
    isLastContent,
    isStreaming,
    isExpanded,
    onToggleReasoning,
}: MessageContentProps) {
    const { t } = useTranslation();

    // Tool call content
    if (content.type === "tool_call") {
        return <ToolCallItem toolCall={content.data as ContentToolCall} />;
    }

    // Tool result content
    if (content.type === "tool_result") {
        return <ToolResultItem toolResult={content.data as ContentToolResult} />;
    }

    if (content.type === "reasoning") {
        return (
            <div>
                <Button variant="ghost" onClick={onToggleReasoning}>
                    {isExpanded ? (
                        <ChevronDown className="size-3" />
                    ) : (
                        <ChevronRight className="size-3" />
                    )}
                    {isLastMessage && isLastContent ? (
                        <span className="shimmer">{t("pages.chat.reasoning.process")}</span>
                    ) : (
                        <span>{t("pages.chat.reasoning.done")}</span>
                    )}
                </Button>
                <div
                    className={`grid transition-all duration-300 ease-in-out ${isExpanded
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                        }`}
                >
                    <div className="overflow-hidden border-l-1 border-[var(--border)] pl-4">
                        <div className="markdown-body pb-2">
                            <Streamdown isAnimating={isStreaming}>
                                {(content.data as ContentReasoning).content}
                            </Streamdown>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Regular message content
    if (messageId === "") {
        return <span className="shimmer">{t("common.generating")}</span>;
    }

    return (
        <div className="markdown-body overflow-x-auto w-full">
            <Streamdown isAnimating={isStreaming}>
                {(content.data as ContentMessage).content}
            </Streamdown>
        </div>
    );
}

