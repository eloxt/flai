import { XCircle, ArrowDownRight, ChevronRight, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ContentToolCall, ContentToolResult } from "./types";
import { ItemMedia, ItemContent, ItemTitle, Item } from "@/components/ui/item";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

interface ToolCallListProps {
    toolCall: ContentToolCall;
}

export function ToolCallItem({ toolCall }: ToolCallListProps) {
    const { t } = useTranslation();

    return (
        <Item variant="outline">
            <ItemMedia variant="icon">
                <ArrowDownRight className="size-4" />
            </ItemMedia>
            <ItemContent>
                <ItemTitle>{t("components.toolCall.callingTool")} <code className="bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">{toolCall.name}</code></ItemTitle>
            </ItemContent>
        </Item>
    );
}

interface ToolResultItemProps {
    toolResult: ContentToolResult;
}

export function ToolResultItem({ toolResult }: ToolResultItemProps) {
    const { t } = useTranslation();
    const isError = toolResult.is_error;

    return (
        <Item variant="outline">
            <ItemMedia variant="icon">
                {isError ? (
                    <XCircle className="size-4 text-red-500" />
                ) : (
                    <Check className="size-4" />
                )}
            </ItemMedia>
            <ItemContent>
                <Collapsible defaultOpen={isError}>
                    <CollapsibleTrigger className="flex items-center gap-1 text-sm group">
                        <code className="bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">{toolResult.name}</code>
                        <span>{isError ? t("components.toolCall.failed") : t("components.toolCall.completed")}</span>
                        <Button variant="ghost" className="ml-4">
                            <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <pre className={`mt-2 p-2 rounded-md overflow-x-auto whitespace-pre-wrap max-h-40 text-xs ${isError ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400' : 'bg-muted'
                            }`}>
                            {toolResult.content}
                        </pre>
                    </CollapsibleContent>
                </Collapsible>
            </ItemContent>
        </Item>
    );
}
