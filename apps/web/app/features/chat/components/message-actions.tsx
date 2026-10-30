import type { MessageRecord } from "@flai/shared"
import { textOf } from "@flai/shared"
import { cn } from "cn"
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, InfoIcon, PencilIcon, RefreshCcwIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ConfirmDialog } from "~/components/confirm-dialog"
import { Button } from "~/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import { formatDateTime, formatNumber } from "~/lib/format"
import { useChatStore } from "../chat-store"
import { siblingsOf } from "../tree"

interface MessageActionsProps {
  message: MessageRecord
  /** Every record shown in this row, oldest first; defaults to the message alone. */
  turn?: MessageRecord[]
  isLast: boolean
  onRegenerate: () => void
  onDelete: () => Promise<void>
  onSwitch: (messageId: string, direction: -1 | 1) => void
  onEdit?: () => void
}

/** Both icons stay mounted and cross-fade, so the copy confirmation reads as a change, not a flicker. */
const ICON_SWAP = "transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-[opacity]"

function IconAction({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function MessageActions({ message, turn = [message], isLast, onRegenerate, onDelete, onSwitch, onEdit }: MessageActionsProps) {
  const { t } = useTranslation()
  const tree = useChatStore((s) => s.tree)
  // A merged turn has one branch control: the latest record with alternatives.
  const branch = turn.findLast((record) => siblingsOf(tree, record.id).count > 1) ?? message
  const siblings = siblingsOf(tree, branch.id)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(turn.map((record) => textOf(record.parts)).filter(Boolean).join("\n\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex items-center gap-0.5 text-muted-foreground">
      {siblings.count > 1 && (
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" aria-label={t("pages.chat.actions.previous")} disabled={!siblings.prev} onClick={() => onSwitch(branch.id, -1)}>
            <ChevronLeftIcon />
          </Button>
          <span className="text-xs tabular-nums">
            {siblings.index + 1}/{siblings.count}
          </span>
          <Button variant="ghost" size="icon-sm" aria-label={t("pages.chat.actions.next")} disabled={!siblings.next} onClick={() => onSwitch(branch.id, 1)}>
            <ChevronRightIcon />
          </Button>
        </div>
      )}
      <IconAction label={t("pages.chat.actions.copy")} onClick={copy}>
        <span className="grid *:col-start-1 *:row-start-1">
          <CopyIcon className={cn(ICON_SWAP, copied && "scale-60 opacity-0")} />
          <CheckIcon className={cn(ICON_SWAP, !copied && "scale-60 opacity-0")} />
        </span>
      </IconAction>
      {onEdit && (
        <IconAction label={t("pages.chat.actions.edit")} onClick={onEdit}>
          <PencilIcon />
        </IconAction>
      )}
      {message.role === "assistant" && <UsagePopover message={message} />}
      <IconAction label={t("pages.chat.actions.regenerate")} onClick={onRegenerate}>
        <RefreshCcwIcon />
      </IconAction>
      {isLast && (
        <>
          <IconAction label={t("common.actions.delete")} onClick={() => setConfirmDelete(true)}>
            <Trash2Icon />
          </IconAction>
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={t("pages.chat.deleteMessage.title")}
            description={t("pages.chat.deleteMessage.description")}
            confirmLabel={t("common.actions.delete")}
            destructive
            onConfirm={onDelete}
          />
        </>
      )}
      {message.role === "assistant" && <span className="ml-2 text-xs">{formatDateTime(message.createdAt)}</span>}
    </div>
  )
}

/** A label and its value; `sub` rows break down the row above them. Rows without a value are left out. */
type UsageRow = { label: string; value: string | undefined; sub?: boolean }

function UsagePopover({ message }: { message: MessageRecord }) {
  const { t } = useTranslation()
  const { metadata } = message
  const usage = metadata.usage
  const timing = metadata.timing
  const input = usage?.inputTokens
  const share = (n: number | undefined) =>
    n ? `${formatNumber(n)}${input ? ` (${Math.round((n / input) * 100)}%)` : ""}` : undefined
  const generatingMs = timing?.firstTokenMs === undefined ? undefined : timing.durationMs - timing.firstTokenMs
  const speed = usage?.outputTokens && generatingMs && generatingMs > 0 ? usage.outputTokens / (generatingMs / 1000) : undefined

  const sections: UsageRow[][] = [
    [
      { label: t("components.modelSelector.provider"), value: metadata.providerName },
      { label: t("components.modelSelector.name"), value: metadata.modelId },
    ],
    [
      { label: t("pages.chat.usage.input"), value: usage && formatNumber(input) },
      { label: t("pages.chat.usage.cacheRead"), value: share(usage?.cachedInputTokens), sub: true },
      { label: t("pages.chat.usage.cacheWrite"), value: share(usage?.cacheWriteTokens), sub: true },
      { label: t("pages.chat.usage.output"), value: usage && formatNumber(usage.outputTokens) },
      { label: t("pages.chat.usage.reasoning"), value: usage?.reasoningTokens ? formatNumber(usage.reasoningTokens) : undefined, sub: true },
      { label: t("components.modelSelector.toolUse"), value: usage?.toolUseTokens ? formatNumber(usage.toolUseTokens) : undefined },
      { label: t("pages.chat.usage.total"), value: usage?.totalTokens ? formatNumber(usage.totalTokens) : undefined },
      { label: t("pages.chat.usage.cost"), value: usage?.cost === undefined ? undefined : formatUsd(usage.cost) },
    ],
    [
      { label: t("pages.chat.usage.firstToken"), value: timing?.firstTokenMs === undefined ? undefined : formatDuration(timing.firstTokenMs) },
      { label: t("pages.chat.usage.duration"), value: timing && formatDuration(timing.durationMs) },
      { label: t("pages.chat.usage.speed"), value: speed ? t("pages.chat.usage.tokensPerSecond", { value: speed.toFixed(1) }) : undefined },
    ],
  ]
    .map((rows) => rows.filter((row) => row.value))
    .filter((rows) => rows.length > 0)

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("pages.chat.actions.info")} />}>
        <InfoIcon />
      </PopoverTrigger>
      <PopoverContent className="w-72 gap-0 divide-y divide-border p-0">
        {sections.map((rows, i) => (
          <dl key={i} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 py-3 text-sm tabular-nums">
            {rows.map(({ label, value, sub }) => (
              <div key={label} className="contents">
                <dt className={cn("text-muted-foreground", sub && "pl-3 text-xs")}>{label}</dt>
                <dd className={cn("truncate text-right", sub && "text-xs text-muted-foreground")}>{value}</dd>
              </div>
            ))}
          </dl>
        ))}
        {metadata.aborted && <p className="px-4 py-3 text-xs text-muted-foreground">{t("pages.chat.stopped")}</p>}
      </PopoverContent>
    </Popover>
  )
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 3 })
const formatUsd = (n: number) => (n > 0 && n < 0.0001 ? "< $0.0001" : usd.format(n))
const formatDuration = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)
