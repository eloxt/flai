import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router";
import { Clock } from "lucide-react";
import type { MetaFunction } from "react-router";
import { useTranslation } from "react-i18next";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";

import { MessageContent } from "./chat/MessageContent";
import { MessageAttachments } from "./chat/MessageAttachments";
import { GoogleGroundingChunks, OpenaiGroundingChunks } from "./chat/GroundingChunks";
import type { TreeNode, ContentMessage } from "./chat/types";

export const meta: MetaFunction = () => {
    return [{ title: "FlaiChat - Shared Conversation" }];
};

interface ShareDetailResponse {
    id: string;
    user_id: string;
    conversation: {
        id: string;
        title: string;
        icon: string;
    };
    message: TreeNode[];
    created_at: string;
    expires_at: string;
}

export default function SharePage() {
    const { t } = useTranslation();
    const { id } = useParams();
    const [shareData, setShareData] = useState<ShareDetailResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (id) {
            fetchShareDetails();
        }
    }, [id]);

    const fetchShareDetails = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await api.get<ShareDetailResponse>(`/public/share/${id}`, undefined, { auth: false });
            setShareData(response);
        } catch {
            setError(t("pages.share.error"));
        } finally {
            setIsLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return "";
        return new Date(dateString).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <Spinner className="size-8" />
            </div>
        );
    }

    if (error || !shareData) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background gap-4">
                <div className="text-xl font-semibold text-destructive">
                    {error || t("pages.share.notFound")}
                </div>
                <p className="text-muted-foreground">
                    {t("pages.share.notFoundDescription")}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-background border-b px-4 py-3">
                <div className="mx-auto max-w-5xl">
                    <div className="flex items-center gap-2">
                        {shareData.conversation.icon && (
                            <span className="text-xl">{shareData.conversation.icon}</span>
                        )}
                        <h1 className="text-lg font-semibold truncate">
                            {shareData.conversation.title || t("pages.share.untitled")}
                        </h1>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <Clock className="size-3" />
                            <span>{t("pages.share.sharedOn")} {formatDate(shareData.created_at)}</span>
                        </div>
                        {shareData.expires_at && (
                            <div className="flex items-center gap-1">
                                <span>{t("pages.share.expiresOn")} {formatDate(shareData.expires_at)}</span>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Messages */}
            <ScrollArea
                className="flex-1 pt-2 px-4 overflow-y-hidden h-full"
            >
                <div className="mx-auto max-w-5xl flex flex-col gap-8 w-full min-w-0 overflow-hidden">
                    {shareData.message.map((message) => (
                        <ShareMessageItem
                            key={message.id}
                            message={message}
                            isExpanded={expandedReasoning.has(message.id)}
                            onToggleReasoning={() => toggleReasoning(message.id)}
                        />
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {/* Footer */}
            <footer className="border-t px-4 py-3 text-center text-sm text-muted-foreground">
                {t("pages.share.footer")}
            </footer>
        </div>
    );
}

// Read-only message item component for share page
interface ShareMessageItemProps {
    message: TreeNode;
    isExpanded: boolean;
    onToggleReasoning: () => void;
}

function ShareMessageItem({ message, isExpanded, onToggleReasoning }: ShareMessageItemProps) {
    return (
        <div className="flex flex-col gap-1 min-w-0 w-full">
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
                            className={`px-4 rounded-2xl min-w-0 w-full ${message.role === "user"
                                ? "bg-[var(--color-user-msg-bg)] py-2"
                                : ""
                                }`}
                        >
                            <MessageContent
                                content={content}
                                contentIndex={index}
                                messageId={message.id}
                                isLastMessage={false}
                                isLastContent={index === message.content.length - 1}
                                isStreaming={false}
                                isExpanded={isExpanded}
                                onToggleReasoning={onToggleReasoning}
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
        </div>
    );
}

