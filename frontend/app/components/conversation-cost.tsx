import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, Database, Info, ReceiptText, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InputGroupButton } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ContentToolCall, Message } from "@/types/chat";

const categories = [
    { key: "input", icon: ArrowDownLeft, color: "text-usage-input" },
    { key: "cache_read", icon: Database, color: "text-usage-cache" },
    { key: "output", icon: ArrowUpRight, color: "text-usage-output" },
    { key: "tool_input", icon: Wrench, color: "text-usage-tools" },
] as const;

const toolKeys = {
    web_search: "webSearch",
    web_search_queries: "webSearchQueries",
    url_context: "urlContext",
    image_generation: "imageGeneration",
} as const;

export function ConversationCost({ messages, streamingId }: {
    messages: ReadonlyMap<string, Message>;
    streamingId?: string;
}) {
    const { t, i18n } = useTranslation(undefined, { keyPrefix: "pages.chat.cost" });
    const summary = useMemo(() => {
        const charges = categories.map(() => ({ tokens: 0, usd: 0, priced: false, missingPrice: false }));
        const tools = new Map<string, { name: string; mcp: boolean; calls: number; usd: number; priced: boolean; missingPrice: boolean }>();
        let hasMessages = false;
        let hasUsage = false;
        let missingUsage = false;
        let legacy = false;

        const addTool = (name: string, mcp: boolean, calls: number, usd?: number) => {
            const key = mcp ? `mcp:${name}` : `builtin:${name}`;
            const tool = tools.get(key) ?? { name, mcp, calls: 0, usd: 0, priced: false, missingPrice: false };
            tool.calls += calls;
            tool.usd += usd ?? 0;
            tool.priced ||= usd != null;
            tool.missingPrice ||= usd == null;
            tools.set(key, tool);
        };

        for (const message of messages.values()) {
            if (message.role !== "assistant" || message.id === streamingId) continue;
            hasMessages = true;
            const meta = message.meta_info;
            legacy ||= !!meta?.usage_legacy;
            missingUsage ||= !meta?.usage?.length;

            for (const round of meta?.usage ?? []) {
                hasUsage ||= !round.incomplete;
                missingUsage ||= !!round.incomplete;
                for (const [index, category] of categories.entries()) {
                    const usage = round[category.key];
                    const charge = charges[index];
                    charge.tokens += usage.tokens;
                    charge.usd += usage.usd ?? 0;
                    charge.priced ||= usage.usd != null;
                    charge.missingPrice ||= usage.tokens > 0 && usage.usd == null;
                }
                for (const tool of round.tools ?? []) {
                    addTool(tool.name, false, tool.calls ?? 0, tool.usd);
                }
            }

            for (const content of message.content) {
                if (content.type === "tool_call") {
                    const { name } = content.data as ContentToolCall;
                    if (name) addTool(name, true, 1);
                }
            }
        }

        const tokenCharge = charges[3];
        const toolCharge = { ...tokenCharge };
        for (const tool of tools.values()) {
            toolCharge.usd += tool.usd;
            toolCharge.priced ||= tool.priced;
            toolCharge.missingPrice ||= tool.missingPrice;
        }
        charges[3] = toolCharge;

        return {
            charges, tokenCharge, tools, hasMessages, hasUsage, missingUsage, legacy,
            missingPrice: charges.some((charge) => charge.missingPrice),
            priced: charges.some((charge) => charge.priced),
            totalUSD: charges.reduce((sum, charge) => sum + charge.usd, 0),
            totalTokens: charges.reduce((sum, charge) => sum + charge.tokens, 0),
        };
    }, [messages, streamingId]);

    const locale = i18n.resolvedLanguage ?? i18n.language;
    const number = new Intl.NumberFormat(locale);
    const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
    const dollars = new Intl.NumberFormat(locale, {
        style: "currency", currency: "USD", currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 4, maximumFractionDigits: 8,
    });
    const formatUSD = (value: number) => value > 0 && value < 1e-8
        ? t("lessThan", { amount: dollars.format(1e-8) })
        : dollars.format(value);
    const partial = summary.missingUsage || summary.missingPrice || summary.legacy;
    const total = summary.priced || !summary.hasMessages || !partial ? formatUSD(summary.totalUSD) : "—";
    const hasToolDetails = summary.tools.size > 0 || summary.tokenCharge.tokens > 0;

    return (
        <Dialog>
            <DialogTrigger asChild>
                <InputGroupButton
                    size="sm"
                    variant="outline"
                    aria-label={t(partial ? "partialTrigger" : "trigger", { amount: total })}
                    className="self-end tabular-nums"
                >
                    <ReceiptText data-icon="inline-start" aria-hidden="true" />
                    <span className="hidden sm:inline">{t(partial ? "knownCost" : "estimate")}</span>
                    <span>{total}</span>
                    <ChevronRight data-icon="inline-end" className="hidden sm:block" aria-hidden="true" />
                </InputGroupButton>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto p-4 sm:max-w-lg sm:p-6">
                <DialogHeader className="pr-8 text-left">
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>

                <div className="rounded-lg border bg-muted/50 p-3 sm:p-4">
                    <dl className="grid grid-cols-2">
                        <div className="min-w-0 pr-2">
                            <dt className="text-xs text-muted-foreground">{t(partial ? "knownTotal" : "totalCost")}</dt>
                            <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
                                <span className="break-all text-xl font-semibold sm:text-2xl">{total}</span>
                                <span className="text-xs text-muted-foreground">USD</span>
                            </dd>
                        </div>
                        <div className="min-w-0 border-l pl-3 sm:pl-4">
                            <dt className="text-xs text-muted-foreground">{t(partial ? "recordedUsage" : "totalUsage")}</dt>
                            <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
                                <span className="break-all text-xl font-semibold sm:text-2xl">
                                    {summary.hasUsage || !summary.hasMessages ? number.format(summary.totalTokens) : "—"}
                                </span>
                                <span className="text-xs text-muted-foreground">{t("token")}</span>
                            </dd>
                        </div>
                    </dl>
                    {summary.totalUSD > 0 && (
                        <div className="mt-3 flex items-center gap-2.5 text-xs text-muted-foreground">
                            <span>{t(partial ? "knownDistribution" : "distribution")}</span>
                            <div className="flex h-2 min-w-0 flex-1 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                                {categories.map(({ key, color }, index) => summary.charges[index].usd > 0 && (
                                    <span key={key} className={cn("bg-current", color)} style={{ flex: summary.charges[index].usd }} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <Table aria-label={t("breakdown")} className="table-fixed text-xs sm:text-sm">
                    <TableHeader>
                        <TableRow>
                            <TableHead scope="col" className="h-8 w-[49%] px-0 text-muted-foreground">{t("category")}</TableHead>
                            <TableHead scope="col" className="h-8 w-[21%] px-0 text-right text-muted-foreground">{t("token")}</TableHead>
                            <TableHead scope="col" className="h-8 px-0 text-right whitespace-normal text-muted-foreground">{t("amountShare")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <Collapsible asChild>
                        <TableBody>
                            {categories.map(({ key, icon: Icon, color }, index) => {
                                const charge = summary.charges[index];
                                const label = (
                                    <>
                                        <span className={cn("grid size-6 shrink-0 place-items-center rounded-md bg-current/10", color)}>
                                            <Icon className="size-3.5" aria-hidden="true" />
                                        </span>
                                        <span className="min-w-0 whitespace-normal">
                                            {t(key)}
                                            {key === "input" && <span className="ml-1 text-xs font-normal text-muted-foreground">{t("uncached")}</span>}
                                            {key === "output" && <span className="ml-1 text-xs font-normal text-muted-foreground">{t("withReasoning")}</span>}
                                        </span>
                                    </>
                                );
                                return (
                                    <TableRow key={key}>
                                        <th scope="row" className="py-2 pr-1 text-left font-medium">
                                            {key === "tool_input" && hasToolDetails ? (
                                                <CollapsibleTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="group -ml-1 h-auto min-h-9 justify-start px-1 text-left text-xs sm:text-sm">
                                                        {label}
                                                        <ChevronDown data-icon="inline-end" aria-hidden="true" className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                                                    </Button>
                                                </CollapsibleTrigger>
                                            ) : (
                                                <span className="flex items-center gap-1.5">{label}</span>
                                            )}
                                        </th>
                                        <TableCell className="px-0 text-right tabular-nums">
                                            {charge.tokens > 0 || (!summary.missingUsage && (key !== "tool_input" || !hasToolDetails))
                                                ? number.format(charge.tokens) : "—"}
                                        </TableCell>
                                        <TableCell className="pl-1 pr-0 text-right font-medium tabular-nums">
                                            {charge.priced || (!charge.missingPrice && !summary.missingUsage) ? formatUSD(charge.usd) : "—"}
                                            {summary.totalUSD > 0 && (charge.priced || !charge.missingPrice) && (
                                                <div className="text-xs font-normal text-muted-foreground">{percent.format(charge.usd / summary.totalUSD)}</div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {hasToolDetails && (
                                <CollapsibleContent asChild>
                                    <TableRow>
                                        <TableCell colSpan={3} className="px-0 whitespace-normal">
                                            <dl className="flex flex-col gap-2 rounded-md bg-muted/50 p-2.5 text-xs">
                                                {summary.tokenCharge.tokens > 0 && (
                                                    <div className="flex flex-wrap justify-between gap-x-2">
                                                        <dt>{t("toolTokens")}</dt>
                                                        <dd className="tabular-nums">{number.format(summary.tokenCharge.tokens)} {t("token")} · {summary.tokenCharge.priced ? formatUSD(summary.tokenCharge.usd) : "—"}</dd>
                                                    </div>
                                                )}
                                                {[...summary.tools.entries()].map(([key, tool]) => (
                                                    <div key={key} className="flex flex-wrap justify-between gap-x-2">
                                                        <dt className="min-w-0 break-all">
                                                            {tool.mcp ? t("mcpTool", { name: tool.name }) : t(toolKeys[tool.name as keyof typeof toolKeys] ?? "tool_input")}
                                                        </dt>
                                                        <dd className="tabular-nums">
                                                            {tool.calls > 0 ? t("calls", { count: tool.calls, formatted: number.format(tool.calls) }) : t("unknownCalls")}
                                                            {" · "}{tool.priced ? formatUSD(tool.usd) : "—"}
                                                        </dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        </TableCell>
                                    </TableRow>
                                </CollapsibleContent>
                            )}
                        </TableBody>
                    </Collapsible>
                </Table>

                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    <p className="flex items-start gap-1.5">
                        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        {t("estimateNote")}
                    </p>
                    {summary.legacy && <p>{t("legacyNote")}</p>}
                    {summary.missingUsage && <p>{t("missingUsageNote")}</p>}
                    {summary.missingPrice && <p>{t("missingPriceNote")}</p>}
                    {streamingId && <p>{t("streamingNote")}</p>}
                </div>
            </DialogContent>
        </Dialog>
    );
}
