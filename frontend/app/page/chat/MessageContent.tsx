import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Streamdown } from "streamdown";
import type { Content, ContentMessage, ContentReasoning, ContentToolCall, ContentToolResult } from "../../types/chat";
import { ToolCallItem, ToolResultItem } from "./ToolCallContent";
import { PhotoProvider, PhotoView } from "react-photo-view";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import "katex/dist/katex.min.css";
import { Shimmer } from "@/components/ai-elements/shimmer";

interface MessageContentProps {
    content: Content;
    contentIndex: number;
    messageId: string;
    role: "user" | "assistant";
    isLastMessage: boolean;
    isLastContent: boolean;
    isStreaming: boolean;
    isExpanded: boolean;
    onToggleReasoning: () => void;
}

export function MessageContent({
    content,
    role,
    isLastMessage,
    isLastContent,
    isStreaming,
    isExpanded,
    onToggleReasoning,
}: MessageContentProps) {
    const { t } = useTranslation();

    if (content.type === "pending" && isStreaming) {
        return <Shimmer>{t("pages.chat.pending")}</Shimmer>;
    }

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
                    {isLastMessage && isLastContent && isStreaming ? (
                        <Shimmer>{t("pages.chat.reasoning.process")}</Shimmer>
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
                    <div className="overflow-hidden border-l border-border pl-4">
                        <div className="markdown-body pb-2">
                            <Streamdown caret="circle" isAnimating={isStreaming} plugins={{ cjk: cjk, math: math }}>
                                {(content.data as ContentReasoning).content}
                            </Streamdown>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (role === "user") {
        return (
            <div className="whitespace-pre-wrap wrap-break-word">
                {(content.data as ContentMessage).content}
            </div>
        );
    }

    return (
        <div className="markdown-body overflow-x-auto w-full">
            <Streamdown caret="block" isAnimating={isStreaming} plugins={{ cjk: cjk, code: code, math: math }}>
                {(content.data as ContentMessage).content}
            </Streamdown>
            {((content.data as ContentMessage).images?.length ?? 0) > 0 && (
                <PhotoProvider>
                    {(content.data as ContentMessage).images!.map((image, index) => (
                        <PhotoView src={image.public_url} key={index}>
                            <img
                                key={index}
                                src={image.public_url}
                                alt="Generated content"
                                className="max-w-64 rounded-lg mt-2"
                            />
                        </PhotoView>
                    ))}
                </PhotoProvider>
            )}
        </div>
    );
}

