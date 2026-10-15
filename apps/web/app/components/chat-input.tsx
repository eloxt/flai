import type { FileRecord, McpServer } from "@flai/shared"
import { cn } from "cn"
import {
  ArrowUpIcon,
  BrainIcon,
  ChevronDownIcon,
  FileIcon,
  GlobeIcon,
  LinkIcon,
  PaperclipIcon,
  SquareIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import TextareaAutosize from "react-textarea-autosize"
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentGroup, AttachmentMedia, AttachmentTitle } from "~/components/ui/attachment"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupButton } from "~/components/ui/input-group"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"
import { isAllowedAttachment, uploadFile } from "~/lib/upload"
import { type BuiltinTool, useInputStore } from "~/store/input-store"
import { useCurrentModel } from "~/store/model-store"

interface ChatInputProps {
  /** Draft and attachments are kept per key (conversation id, or "new"). */
  draftKey: string
  /** Return false to keep the draft (e.g. nothing was sent). */
  onSubmit: (input: { text: string; files: FileRecord[] }) => Promise<boolean> | boolean
  streaming?: boolean
  stopping?: boolean
  onStop?: () => void
  /** 0–100 share of the model's context window used by the conversation. */
  contextUsage?: number
  autoFocus?: boolean
}

interface Pending {
  id: string
  name: string
}

const EMPTY: FileRecord[] = []

export function ChatInput({ draftKey, onSubmit, streaming = false, stopping = false, onStop, contextUsage, autoFocus }: ChatInputProps) {
  const { t } = useTranslation()
  const current = useCurrentModel()
  const model = current?.model
  const text = useInputStore((s) => s.drafts[draftKey] ?? "")
  const setDraft = useInputStore((s) => s.setDraft)
  const files = useInputStore((s) => s.attachments[draftKey] ?? EMPTY)
  const setAttachments = useInputStore((s) => s.setAttachments)
  const [pending, setPending] = useState<Pending[]>([])
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  const canAttach = Boolean(model?.attachment)

  const upload = useCallback(
    async (list: File[]) => {
      for (const file of list) {
        if (!isAllowedAttachment(file)) {
          notify.error(t("common.fileTypeNotAllowed"))
          continue
        }
        const id = crypto.randomUUID()
        setPending((p) => [...p, { id, name: file.name }])
        try {
          const record = await uploadFile(file)
          const latest = useInputStore.getState().attachments[draftKey] ?? []
          setAttachments(draftKey, [...latest, record])
        } catch (error) {
          notify.error(error, t("common.uploadFailed"))
        } finally {
          setPending((p) => p.filter((x) => x.id !== id))
        }
      }
    },
    [draftKey, setAttachments, t]
  )

  const submit = async () => {
    if (streaming || pending.length > 0) return
    if (!text.trim() && files.length === 0) return
    const sent = { text: text.trim(), files }
    setDraft(draftKey, "")
    setAttachments(draftKey, [])
    const ok = await onSubmit(sent)
    if (!ok && !useInputStore.getState().drafts[draftKey]) {
      setDraft(draftKey, sent.text)
      setAttachments(draftKey, sent.files)
    }
    textarea.current?.focus()
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (!canAttach) return
    void upload(Array.from(e.dataTransfer.files))
  }

  return (
    <div
      className="relative flex w-full min-w-0 flex-col rounded-2xl border bg-muted/60"
      onDragEnter={(e) => {
        e.preventDefault()
        if (!canAttach) return
        dragDepth.current++
        setDragging(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        if (--dragDepth.current <= 0) setDragging(false)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-primary bg-background/80 text-sm backdrop-blur-sm">
          <PaperclipIcon className="size-5" />
          <span className="font-medium">{t("common.dropFilesHere")}</span>
          <span className="text-xs text-muted-foreground">{t("common.allowedFileTypes")}</span>
        </div>
      )}
      <InputGroup className="h-auto flex-col rounded-2xl border-0 bg-background shadow-xs dark:bg-background">
        {(files.length > 0 || pending.length > 0) && (
          <AttachmentGroup className="w-full px-3 pt-3">
            {files.map((file) => (
              <Attachment key={file.id} size="sm" state="done">
                <AttachmentMedia variant={file.mediaType.startsWith("image/") ? "image" : "icon"}>
                  {file.mediaType.startsWith("image/") ? <img src={file.url} alt="" /> : <FileIcon />}
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle className="max-w-36">{file.name}</AttachmentTitle>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    aria-label={t("common.actions.delete")}
                    onClick={() => setAttachments(draftKey, files.filter((f) => f.id !== file.id))}
                  >
                    <XIcon />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}
            {pending.map((p) => (
              <Attachment key={p.id} size="sm" state="uploading">
                <AttachmentMedia>
                  <FileIcon />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle className="max-w-36">{p.name}</AttachmentTitle>
                </AttachmentContent>
              </Attachment>
            ))}
          </AttachmentGroup>
        )}
        <TextareaAutosize
          ref={textarea}
          data-slot="input-group-control"
          placeholder={t("pages.chat.placeholder")}
          value={text}
          autoFocus={autoFocus}
          minRows={2}
          maxRows={7}
          onChange={(e) => setDraft(draftKey, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
          onPaste={(e) => {
            if (!canAttach) return
            const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"))
            if (images.length) {
              e.preventDefault()
              void upload(images)
            }
          }}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none md:text-[15px]"
        />
        <InputGroupAddon align="block-end" className="gap-2 px-3 pb-3">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []))
              e.target.value = ""
            }}
          />
          {canAttach && (
            <InputGroupButton size="icon-sm" aria-label={t("common.attachment")} onClick={() => fileInput.current?.click()}>
              <PaperclipIcon />
            </InputGroupButton>
          )}
          <div className="ml-auto flex items-center gap-2">
            {contextUsage !== undefined && <ContextUsageRing percentage={contextUsage} />}
            {streaming ? (
              <InputGroupButton variant="destructive" size="icon-sm" className="rounded-xl" aria-label={t("pages.chat.actions.stop")} disabled={stopping} onClick={onStop}>
                <SquareIcon />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                variant="default"
                size="icon-sm"
                className="rounded-xl"
                aria-label={t("common.send")}
                disabled={pending.length > 0 || (!text.trim() && files.length === 0)}
                onClick={() => void submit()}
              >
                <ArrowUpIcon />
              </InputGroupButton>
            )}
          </div>
        </InputGroupAddon>
      </InputGroup>
      <ToolBar />
    </div>
  )
}

/** Built-in tools, MCP tools and thinking level for the selected model. */
function ToolBar() {
  const { t } = useTranslation()
  const model = useCurrentModel()?.model
  const builtinTools = useInputStore((s) => s.builtinTools)
  const setBuiltinTools = useInputStore((s) => s.setBuiltinTools)
  const mcpTools = useInputStore((s) => s.mcpTools)
  const setMcpTools = useInputStore((s) => s.setMcpTools)
  const thinking = useInputStore((s) => s.thinking)
  const setThinking = useInputStore((s) => s.setThinking)
  const [servers, setServers] = useState<McpServer[]>([])

  useEffect(() => {
    if (!model?.toolCall) return
    let active = true
    api<McpServer[]>("/mcp-servers")
      .then((list) => active && setServers(list.filter((s) => s.isActive && s.tools.length > 0)))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [model?.toolCall])

  // Forget a thinking level the newly selected model doesn't offer.
  useEffect(() => {
    if (thinking && model && !model.thinkingLevels.includes(thinking)) setThinking(null)
  }, [model, thinking, setThinking])

  if (!model) return null
  const levels = model.thinkingLevels
  const effectiveThinking = thinking && levels.includes(thinking) ? thinking : levels[0]
  const builtins: Array<{ value: BuiltinTool; tool: "web_search" | "url_context"; icon: typeof GlobeIcon; label: string; tip: string }> = [
    { value: "webSearch", tool: "web_search", icon: GlobeIcon, label: t("common.search"), tip: t("components.chatInput.web_search_tooltip") },
    { value: "urlContext", tool: "url_context", icon: LinkIcon, label: t("common.urlContext"), tip: t("components.chatInput.url_context_tooltip") },
  ]
  const available = builtins.filter((b) => model.internalTools.includes(b.tool))
  const hasMcp = model.toolCall && servers.length > 0
  if (!hasMcp && levels.length === 0 && available.length === 0) return null

  const isSelected = (serverId: string, name: string) => mcpTools.some((x) => x.serverId === serverId && x.name === name)
  const toggleMcp = (serverId: string, name: string) => {
    if (isSelected(serverId, name)) setMcpTools(mcpTools.filter((x) => !(x.serverId === serverId && x.name === name)))
    else {
      // Provider-executed tools and MCP function tools can't be mixed in one request.
      setMcpTools([...mcpTools, { serverId, name }])
      setBuiltinTools([])
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto px-2 py-1 text-muted-foreground">
      {hasMcp && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className={cn(mcpTools.length > 0 && "bg-foreground/10 text-foreground")} />}>
            <WrenchIcon data-icon="inline-start" />
            {t("components.chatInput.mcpTools")}
            {mcpTools.length > 0 && <span className="tabular-nums">({mcpTools.length})</span>}
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {servers.map((server, index) => (
              <DropdownMenuGroup key={server.id}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel>{server.name}</DropdownMenuLabel>
                {server.tools.map((tool) => (
                  <DropdownMenuCheckboxItem
                    key={tool.name}
                    checked={isSelected(server.id, tool.name)}
                    onCheckedChange={() => toggleMcp(server.id, tool.name)}
                    closeOnClick={false}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{tool.name}</span>
                      {tool.description && <span className="truncate text-xs text-muted-foreground">{tool.description}</span>}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {levels.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className={cn(thinking && "bg-foreground/10 text-foreground")} />}>
            <BrainIcon data-icon="inline-start" />
            {t(`components.chatInput.thinking.${effectiveThinking}`)}
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup value={effectiveThinking} onValueChange={(value) => setThinking(value as typeof thinking)}>
              {levels.map((level) => (
                <DropdownMenuRadioItem key={level} value={level}>
                  {t(`components.chatInput.thinking.${level}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {available.length > 0 && (
        <ToggleGroup
          multiple
          size="sm"
          value={builtinTools.filter((b) => available.some((a) => a.value === b))}
          onValueChange={(value) => {
            setBuiltinTools(value as BuiltinTool[])
            if (value.length > 0) setMcpTools([])
          }}
        >
          {available.map(({ value, icon: Icon, label, tip }) => (
            <Tooltip key={value}>
              <TooltipTrigger render={<ToggleGroupItem value={value} aria-label={label} />}>
                <Icon />
                {label}
              </TooltipTrigger>
              <TooltipContent>{tip}</TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>
      )}
    </div>
  )
}

function ContextUsageRing({ percentage }: { percentage: number }) {
  const size = 22
  const stroke = 3
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = percentage >= 90 ? "var(--destructive)" : percentage >= 70 ? "var(--chart-4)" : "var(--chart-1)"
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums" />}>
        {Math.round(percentage)}%
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="opacity-20" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (Math.min(100, percentage) / 100) * c} />
        </svg>
      </TooltipTrigger>
      <TooltipContent>{`${Math.round(percentage)}%`}</TooltipContent>
    </Tooltip>
  )
}
