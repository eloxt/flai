import { cn } from "cn"
import { ArrowDownLeftIcon, ArrowUpRightIcon, ChevronDownIcon, ChevronRightIcon, DatabaseIcon, FileClockIcon, InfoIcon, ReceiptTextIcon, WrenchIcon } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog"
import { InputGroupButton } from "~/components/ui/input-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table"
import { useChatStore } from "~/features/chat/chat-store"
import { toolMeta } from "~/features/chat/tool-meta"
import { formatNumber, formatUsd } from "~/lib/format"

const categories = [
  { key: "input", icon: ArrowDownLeftIcon, color: "text-usage-input" },
  { key: "cacheRead", icon: DatabaseIcon, color: "text-usage-cache" },
  { key: "cacheWrite", icon: DatabaseIcon, color: "text-usage-cache" },
  { key: "output", icon: ArrowUpRightIcon, color: "text-usage-output" },
  { key: "toolInput", icon: WrenchIcon, color: "text-usage-tools" },
  { key: "historical", icon: FileClockIcon, color: "text-muted-foreground" },
] as const

export function ConversationCost() {
  const { t, i18n } = useTranslation()
  const messages = useChatStore((s) => s.map)
  const [expanded, setExpanded] = useState(false)
  const toolDetailId = useId()
  const p = "pages.chat.costDetails"
  const percent = new Intl.NumberFormat(i18n.resolvedLanguage, { style: "percent", maximumFractionDigits: 1 })

  const summary = useMemo(() => {
    // All saved branches count, including regenerated replies.
    const tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, toolInput: 0, historical: undefined }
    const amounts: Partial<Record<(typeof categories)[number]["key"], number>> = {}
    const tools = new Map<string, { name: string; calls: number; usd?: number; queries?: boolean }>()
    let hasReplies = false
    let missingEstimate = false
    let modelToolCost: number | undefined
    let totalTokens: number | undefined
    let totalCost: number | undefined

    for (const message of Object.values(messages)) {
      if (message.role !== "assistant") continue
      hasReplies = true
      const usage = message.metadata.usage
      const input = usage?.inputTokens ?? 0
      const output = usage?.outputTokens ?? 0
      const cacheRead = usage?.cachedInputTokens ?? 0
      const cacheWrite = usage?.cacheWriteTokens ?? 0
      const uncached = Math.max(0, input - cacheRead - cacheWrite)
      const toolInput = Math.min(uncached, usage?.toolInputTokens ?? 0)
      tokens.input += uncached - toolInput
      tokens.cacheRead += cacheRead
      tokens.cacheWrite += cacheWrite
      tokens.output += output
      tokens.toolInput += toolInput + (usage?.toolUseTokens ?? 0)
      const total = usage?.totalTokens ?? (usage?.inputTokens !== undefined || usage?.outputTokens !== undefined
        ? input + output + (usage?.toolUseTokens ?? 0) : undefined)
      if (total !== undefined) totalTokens = (totalTokens ?? 0) + total

      if (usage?.cost !== undefined) {
        totalCost = (totalCost ?? 0) + usage.cost
        if (usage.costBreakdown) {
          for (const key of ["input", "output", "cacheRead", "cacheWrite", "toolInput"] as const) {
            amounts[key] = (amounts[key] ?? 0) + usage.costBreakdown[key]
          }
          if (toolInput > 0) modelToolCost = (modelToolCost ?? 0) + usage.costBreakdown.toolInput
        } else if (usage.toolCallsCost === undefined) {
          amounts.historical = (amounts.historical ?? 0) + usage.cost
        } else {
          missingEstimate = true
        }
        if (usage.toolCallsCost !== undefined) {
          amounts.toolInput = (amounts.toolInput ?? 0) + usage.toolCallsCost
        }
      } else {
        missingEstimate = true
      }

      const seen = new Set<string>()
      let sawGoogleSearch = false
      for (const part of message.parts) {
        if (!("toolCallId" in part) || part.state === "input-streaming" || seen.has(part.toolCallId)) continue
        seen.add(part.toolCallId)
        const name = part.type === "dynamic-tool" ? part.toolName : part.type.slice(5)
        sawGoogleSearch ||= name === "google_search"
        const key = `${part.providerExecuted ? "native" : "app"}:${name}`
        const tool = tools.get(key) ?? { name, calls: 0 }
        tool.calls += 1
        tools.set(key, tool)
      }
      const nativeSearch = tools.get("native:web_search")
      if (nativeSearch && usage?.toolCallsCost !== undefined) {
        nativeSearch.usd = (nativeSearch.usd ?? 0) + usage.toolCallsCost
      }
      if (!sawGoogleSearch) {
        const queries = new Set(message.metadata.googleGrounding?.webSearchQueries?.map((query) => query.trim()).filter(Boolean))
        if (queries.size > 0) {
          const tool = tools.get("google:queries") ?? { name: "google_search", queries: true, calls: 0 }
          tool.calls += queries.size
          tools.set("google:queries", tool)
        }
      }
    }
    return { tokens, amounts, tools, hasReplies, missingEstimate, modelToolCost, totalTokens, totalCost }
  }, [messages])

  if (!summary.hasReplies) return null

  const rows = categories.filter(({ key }) =>
    key === "cacheWrite" ? summary.tokens.cacheWrite > 0 || Boolean(summary.amounts.cacheWrite)
      : key !== "historical" || summary.amounts.historical !== undefined,
  )
  const total = summary.totalCost === undefined ? "—" : formatUsd(summary.totalCost)
  const hasTools = summary.tools.size > 0 || summary.tokens.toolInput > 0

  return (
    <Dialog onOpenChange={(open) => { if (!open) setExpanded(false) }}>
      <DialogTrigger render={<InputGroupButton
        aria-label={`${t("pages.chat.usage.conversationCost")}, ${total}`}
        className="h-8 gap-1 px-1.5 text-xs text-muted-foreground tabular-nums focus-visible:ring-inset"
      />}>
        <ReceiptTextIcon aria-hidden="true" />
        {total}
        <ChevronRightIcon className="hidden sm:block" aria-hidden="true" />
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-3 overflow-y-auto p-4 sm:max-w-lg sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle>{t(`${p}.title`)}</DialogTitle>
          <DialogDescription>{t(`${p}.description`)}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-muted/60 p-3 sm:p-4">
          <dl className="grid grid-cols-2">
            <div className="min-w-0 pr-3">
              <dt className="text-xs text-muted-foreground">{t(summary.missingEstimate ? `${p}.knownCost` : "pages.chat.usage.conversationCost")}</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums sm:text-2xl">{total} <span className="text-xs font-normal text-muted-foreground">USD</span></dd>
            </div>
            <div className="min-w-0 border-l pl-3 sm:pl-4">
              <dt className="text-xs text-muted-foreground">{t(`${p}.totalUsage`)}</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums sm:text-2xl">{formatNumber(summary.totalTokens)} <span className="text-xs font-normal text-muted-foreground">{t("pages.chat.usage.tokens")}</span></dd>
            </div>
          </dl>
          {(summary.totalCost ?? 0) > 0 && (
            <div className="mt-3 flex items-center gap-2.5 text-xs text-muted-foreground">
              <span>{t(`${p}.distribution`)}</span>
              <div className="flex h-2 min-w-0 flex-1 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {rows.map(({ key, color }) => (summary.amounts[key] ?? 0) > 0 && (
                  <span key={key} className={cn("bg-current", color)} style={{ flex: summary.amounts[key] }} />
                ))}
              </div>
            </div>
          )}
        </div>

        <Table aria-label={t(`${p}.title`)} className="table-fixed text-xs sm:text-sm">
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="h-8 w-[49%] px-0 text-xs text-muted-foreground">{t(`${p}.category`)}</TableHead>
              <TableHead scope="col" className="h-8 w-[19%] px-0 text-right text-xs text-muted-foreground">{t("pages.chat.usage.tokens")}</TableHead>
              <TableHead scope="col" className="h-8 px-0 text-right text-xs text-muted-foreground">{t(`${p}.amountShare`)}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ key, icon: Icon, color }) => {
              const usd = summary.amounts[key]
              const tokenCount = summary.tokens[key]
              const label = (
                <>
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-md bg-current/10", color)}>
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 whitespace-normal">
                    {t(`${p}.${key}`)}
                    {key === "output" && <span className="ml-1 text-xs font-normal text-muted-foreground">{t(`${p}.reasoning`)}</span>}
                  </span>
                </>
              )
              return (
                <TableRow key={key}>
                  <th scope="row" className="py-2 pr-1 text-left font-medium">
                    {key === "toolInput" && hasTools ? (
                      <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} aria-controls={toolDetailId}
                        className="group -ml-1 h-auto min-h-8 justify-start gap-1.5 px-1 text-left text-xs sm:text-sm"
                        onClick={() => setExpanded(!expanded)}>
                        {label}
                        <ChevronDownIcon className="text-muted-foreground group-aria-expanded:rotate-180" aria-hidden="true" />
                      </Button>
                    ) : <span className="flex items-center gap-1.5">{label}</span>}
                  </th>
                  <TableCell className="px-0 text-right tabular-nums">{tokenCount ? formatNumber(tokenCount) : "—"}</TableCell>
                  <TableCell className="pl-1 pr-0 text-right font-medium tabular-nums">
                    {usd === undefined ? "—" : formatUsd(usd)}
                    {usd !== undefined && (summary.totalCost ?? 0) > 0 && (
                      <div className="text-xs font-normal text-muted-foreground">{percent.format(usd / summary.totalCost!)}</div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {hasTools && (
              <TableRow id={toolDetailId} hidden={!expanded}>
                <TableCell colSpan={3} className="px-0 whitespace-normal">
                  <dl className="flex flex-col gap-2 rounded-md bg-muted/60 p-2.5 text-xs">
                    {summary.tokens.toolInput > 0 && (
                      <div className="flex flex-wrap justify-between gap-x-2">
                        <dt>{t(`${p}.toolTokens`)}</dt>
                        <dd className="tabular-nums">{formatNumber(summary.tokens.toolInput)} {t("pages.chat.usage.tokens")} · {summary.modelToolCost === undefined ? "—" : formatUsd(summary.modelToolCost)}</dd>
                      </div>
                    )}
                    {[...summary.tools].map(([key, tool]) => {
                      const { icon: Icon, key: builtin } = toolMeta(tool.name)
                      return (
                        <div key={key} className="flex flex-wrap justify-between gap-x-2">
                          <dt className="flex min-w-0 items-center gap-1.5 break-all">
                            <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            {tool.queries ? t(`${p}.searchQueries`) : builtin ? t(`components.tools.${builtin}.done`) : tool.name}
                          </dt>
                          <dd className="tabular-nums">{t(`${p}.calls`, { count: tool.calls })} · {tool.usd === undefined ? "—" : formatUsd(tool.usd)}</dd>
                        </div>
                      )
                    })}
                  </dl>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <p className="flex items-start gap-1.5"><InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{t(`${p}.estimateNote`)}</p>
          {summary.amounts.historical !== undefined && <p>{t(`${p}.historicalNote`)}</p>}
          {summary.missingEstimate && <p>{t(`${p}.missingNote`)}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
