import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Copy, Trash2, RefreshCcw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    AlertDialog,
    AlertDialogTrigger,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogFooter,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogCancel,
    AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { TreeNode, ContentMessage } from "./types";

interface MessageActionsProps {
    message: TreeNode;
    messageIndex: number;
    pathLength: number;
    isStreaming: boolean;
    nodeMap: Map<string, TreeNode>;
    onSwitchNode: (message: TreeNode, isNext: boolean) => void;
    onRetry: (message: TreeNode) => void;
    onDelete: () => void;
}

export function MessageActions({
    message,
    messageIndex,
    pathLength,
    isStreaming,
    nodeMap,
    onSwitchNode,
    onRetry,
    onDelete,
}: MessageActionsProps) {
    const { t } = useTranslation();

    // Don't show actions for the last message while streaming
    if (messageIndex === pathLength - 1 && isStreaming) {
        return null;
    }

    const parentNode = message.parent_id ? nodeMap.get(message.parent_id) : null;
    const siblingCount = parentNode?.children?.length ?? 0;
    const currentIndex = parentNode?.children?.indexOf(message) ?? 0;

    const handleCopy = () => {
        const content = message.content;
        const lastContent = content[content.length - 1];
        navigator.clipboard.writeText((lastContent.data as ContentMessage).content);
    };

    return (
        <div
            className={`flex items-center gap-0 px-3 py-1 ${message.role === "user"
                    ? "self-end opacity-0 group-hover:opacity-100 transition-opacity"
                    : ""
                }`}
        >
            {/* Sibling navigation */}
            {message.parent_id && siblingCount > 1 && (
                <>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onSwitchNode(message, false)}
                    >
                        <ChevronLeft className="size-4 text-muted-foreground" />
                    </Button>
                    <div className="text-sm font-medium text-muted-foreground">
                        {currentIndex + 1}/{siblingCount}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onSwitchNode(message, true)}
                    >
                        <ChevronRight className="size-4 text-muted-foreground" />
                    </Button>
                </>
            )}

            {/* Copy button */}
            <Button variant="ghost" size="icon-sm" onClick={handleCopy}>
                <Copy className="size-4 text-muted-foreground" />
            </Button>

            {/* Meta info popover */}
            {message.meta_info && message.meta_info?.model_name !== "" && (
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                            <Info className="size-4 text-muted-foreground" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="max-w-2xs">
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                    <span className="text-sm font-medium">
                                        {t("components.modelSelector.provider")}
                                    </span>
                                    <span className="text-sm text-right text-muted-foreground">
                                        {message.meta_info.provider_name}
                                    </span>
                                </div>
                                <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                    <span className="text-sm font-medium">
                                        {t("components.modelSelector.name")}
                                    </span>
                                    <span className="text-sm text-right text-muted-foreground">
                                        {message.meta_info.model_name}
                                    </span>
                                </div>
                                <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                    <span className="text-sm font-medium">
                                        {t("components.modelSelector.input")}
                                    </span>
                                    <span className="text-sm text-right text-muted-foreground">
                                        {message.meta_info.prompt_token_count}
                                    </span>
                                </div>
                                {message.meta_info.reasoning_token_count > 0 && (
                                    <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                        <span className="text-sm font-medium">
                                            {t("components.modelSelector.badge.reasoning")}
                                        </span>
                                        <span className="text-sm text-right text-muted-foreground">
                                            {message.meta_info.reasoning_token_count}
                                        </span>
                                    </div>
                                )}
                                <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                    <span className="text-sm font-medium">
                                        {t("components.modelSelector.output")}
                                    </span>
                                    <span className="text-sm text-right text-muted-foreground">
                                        {message.meta_info.response_token_count}
                                    </span>
                                </div>
                                {message.meta_info.cached_token_count > 0 && (
                                    <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                        <span className="text-sm font-medium">
                                            {t("components.modelSelector.cached")}
                                        </span>
                                        <span className="text-sm text-right text-muted-foreground">
                                            {message.meta_info.cached_token_count}
                                        </span>
                                    </div>
                                )}
                                {message.meta_info.tool_use_token_count > 0 && (
                                    <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                        <span className="text-sm font-medium">
                                            {t("components.modelSelector.toolUse")}
                                        </span>
                                        <span className="text-sm text-right text-muted-foreground">
                                            {message.meta_info.tool_use_token_count}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            )}

            {/* Delete button (only for last message) */}
            {messageIndex === pathLength - 1 && (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                            <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action will delete the latest message pair.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={onDelete}>Confirm</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}

            {/* Retry button */}
            <Button variant="ghost" size="icon-sm" onClick={() => onRetry(message)}>
                <RefreshCcw className="size-4 text-muted-foreground" />
            </Button>

            {/* Timestamp for assistant messages */}
            {message.role === "assistant" && (
                <span className="ml-2 text-sm text-muted-foreground">
                    {message.created_at.toLocaleString()}
                </span>
            )}
        </div>
    );
}
