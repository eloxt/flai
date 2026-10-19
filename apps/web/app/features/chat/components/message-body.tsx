import type { AskUserAnswer, FlaiPart, MessageMetadata } from "@flai/shared"
import { askUserQuestionSchema, askUserResultSchema, fileMetaOf, isAskUserPart } from "@flai/shared"
import { cn } from "cn"
import { ArrowUpRightIcon, ChevronRightIcon, FileIcon, GlobeIcon } from "lucide-react"
import { lazy, memo, Suspense, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { PhotoProvider, PhotoView } from "react-photo-view"
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "~/components/ui/attachment"
import { Bubble, BubbleContent } from "~/components/ui/bubble"
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "~/components/ui/avatar"
import { GenuiBoundary } from "~/components/genui/genui-boundary"
import { Markdown } from "~/components/markdown"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible"
import { Separator } from "~/components/ui/separator"
import { formatBytes } from "~/lib/format"
import { applyGoogleCitations } from "../grounding"
import { splitSegments } from "../segments"
import { QuestionCard } from "./question-card"
import "react-photo-view/dist/react-photo-view.css"

const GenuiBlock = lazy(() => import("~/components/genui/genui-block").then((module) => ({ default: module.GenuiBlock })))

type FilePart = Extract<FlaiPart, { type: "file" }>
type ToolPart = Extract<FlaiPart, { type: "dynamic-tool" }>
type Source = { url: string; title?: string; number: number }

interface MessageBodyProps {
  role: "user" | "assistant"
  parts: FlaiPart[]
  metadata?: MessageMetadata
  /** True while this message is being generated. */
  streaming?: boolean
  /** Continue the conversation from a GenUI action; omitted where replies aren't possible. */
  onSend?: (text: string) => void
  onAnswer?: (toolCallId: string, answer: AskUserAnswer) => Promise<boolean>
}

export const MessageBody = memo(function MessageBody({ role, parts, metadata, streaming = false, onSend, onAnswer }: MessageBodyProps) {
  const grounding = metadata?.googleGrounding
  // Citations are derived for display only; stored text stays untouched.
  const texts = useMemo(() => {
    const raw = parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text)
    return role === "assistant" ? applyGoogleCitations(raw, grounding) : raw
  }, [parts, grounding, role])

  if (role === "user") return <UserBody parts={parts} />

  let textIndex = 0
  // Gemini citation numbers follow chunk order, including chunks without a web URL.
  const sources: Source[] = (grounding?.groundingChunks ?? []).flatMap(({ web }, i) =>
    web?.uri ? [{ url: web.uri, title: web.title, number: i + 1 }] : []
  )
  for (const part of parts) {
    if (part.type === "source-url" && !sources.some((source) => source.url === part.url)) {
      sources.push({ url: part.url, title: part.title, number: (sources.at(-1)?.number ?? 0) + 1 })
    }
  }
  const visible = parts.filter((p) => p.type !== "source-url" && p.type !== "step-start")
  const pending = streaming && visible.length === 0

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {pending && <Shimmer />}
      {groupActivity(visible).map((part, i, items) => {
        const isLast = i === items.length - 1
        if (Array.isArray(part)) return <Activity key={i} parts={part} active={streaming && isLast} />
        if (isAskUserPart(part) && (part.state === "input-available" || part.state === "output-available")) {
          const question = askUserQuestionSchema.safeParse(part.input)
          const result = part.state === "output-available" ? askUserResultSchema.safeParse(part.output) : undefined
          if (question.success) return (
            <QuestionCard
              key={part.toolCallId}
              toolCallId={part.toolCallId}
              question={question.data}
              answer={result?.success ? result.data.answer : undefined}
              onAnswer={part.state === "input-available" ? onAnswer : undefined}
            />
          )
        }
        switch (part.type) {
          case "text": {
            const text = texts[textIndex++] ?? part.text
            return <AssistantText key={i} text={text} streaming={streaming && isLast} onSend={onSend} />
          }
          case "file":
            return <Attachments key={i} files={[part]} align="start" />
          default:
            return null
        }
      })}
      {/* Sources arrive with each tool result; show them once, after the agent has finished. */}
      {!streaming && sources.length > 0 && <Sources sources={sources} />}
    </div>
  )
})

function isActivityPart(part: FlaiPart): boolean {
  // Answerable questions render as cards in the reply, not as tool activity.
  if (isAskUserPart(part) && (part.state === "input-available" || part.state === "output-available")) return false
  return part.type === "reasoning" || part.type === "dynamic-tool" || part.type.startsWith("tool-")
}

/** Collapse each run of reasoning and tool calls into one activity group, keeping reply order. */
function groupActivity(parts: FlaiPart[]): (FlaiPart | FlaiPart[])[] {
  const items: (FlaiPart | FlaiPart[])[] = []
  for (const part of parts) {
    const last = items.at(-1)
    if (!isActivityPart(part)) items.push(part)
    else if (Array.isArray(last)) last.push(part)
    else items.push([part])
  }
  return items
}

function toDynamic(part: FlaiPart): ToolPart {
  if (part.type === "dynamic-tool") return part
  const p = part as unknown as ToolPart & { type: string }
  return { ...p, type: "dynamic-tool", toolName: p.toolName ?? p.type.slice(5) } as ToolPart
}

function UserBody({ parts }: { parts: FlaiPart[] }) {
  const files = parts.filter((p): p is FilePart => p.type === "file")
  const text = parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n")
  return (
    <div className="flex max-w-[80%] min-w-0 flex-col items-end gap-2 self-end">
      {files.length > 0 && <Attachments files={files} align="end" />}
      {text && (
        <Bubble align="end" variant="muted" className="max-w-full">
          {/* User turns sit on a stone surface; hierarchy comes from tone, not a second hue. */}
          <BubbleContent className="rounded-sm bg-user-msg! text-[15px] whitespace-pre-wrap">{text}</BubbleContent>
        </Bubble>
      )}
    </div>
  )
}

function GenuiCode({ code }: { code: string }) {
  return <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{code}</pre>
}

function AssistantText({ text, streaming, onSend }: { text: string; streaming: boolean; onSend?: (text: string) => void }) {
  const segments = useMemo(() => splitSegments(text), [text])
  return (
    <>
      {segments.map((segment, i) =>
        segment.kind === "markdown" ? (
          <Markdown key={i} streaming={streaming && i === segments.length - 1}>
            {segment.text}
          </Markdown>
        ) : (
          // The boundary sits outside Suspense so a failed chunk load also falls back to the code.
          <GenuiBoundary key={i} fallback={<GenuiCode code={segment.code} />}>
            <Suspense fallback={<GenuiCode code={segment.code} />}>
              <GenuiBlock code={segment.code} streaming={streaming && !segment.complete} onSend={onSend} />
            </Suspense>
          </GenuiBoundary>
        )
      )}
    </>
  )
}

/** In-progress status text: muted, sized to its text, with the shared constant-speed shimmer. */
function Shimmer({ children, className }: { children?: React.ReactNode; className?: string }) {
  const { t } = useTranslation()
  return <span className={cn("w-fit text-sm text-muted-foreground text-shimmer", className)}>{children ?? t("pages.chat.pending")}</span>
}

const statusRow = "flex min-h-8 max-w-full min-w-0 items-center gap-2 rounded-sm px-1 text-xs text-foreground/70"
const caption = "text-[11px] leading-4 tracking-wide uppercase text-foreground/40"

/** Status for a run of reasoning and tool calls; reasoning text is never shown, tool details expand. */
function Activity({ parts, active }: { parts: FlaiPart[]; active: boolean }) {
  const { t } = useTranslation()
  const tools = parts.filter((part) => part.type !== "reasoning").map(toDynamic)
  const running = active ? tools.find(isRunning) : undefined
  const failed = tools.filter((part) => part.state === "output-error").length
  const names = [...new Set(tools.map(toolLabel))]
  const status = active ? (
    <>
      <Shimmer className="shrink-0 text-xs text-foreground/70">{running ? t("pages.chat.activity.usingTool") : t("pages.chat.activity.thinking")}</Shimmer>
      {running && <code className="min-w-0 truncate font-mono text-[11px] text-foreground/70">{toolLabel(running)}</code>}
    </>
  ) : (
    <>
      <span className="shrink-0">
        {tools.length > 0 ? t("pages.chat.activity.usedTools", { count: tools.length }) : t("pages.chat.activity.thought")}
        {failed > 0 && <span className="text-destructive"> · {t("pages.chat.activity.failed", { count: failed })}</span>}
      </span>
      {names.length > 0 && <code className="min-w-0 truncate font-mono text-[11px] text-foreground/40">{names.join(" · ")}</code>}
    </>
  )
  // Without tool details there is nothing to expand.
  if (tools.length === 0) return <div className={statusRow}>{status}</div>
  return (
    <Collapsible>
      <CollapsibleTrigger className={cn(statusRow, "group/activity w-fit hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring")}>
        {status}
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3 shrink-0 group-data-[panel-open]/activity:rotate-90 motion-safe:transition-transform motion-safe:duration-150"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="transition-none">
        {/* The rule starts under the status text and binds the calls to their status line. */}
        <ol className="ml-1 flex min-w-0 flex-col border-l py-1 pl-2">
          {tools.map((part, index) => <ToolCall key={part.toolCallId} part={part} index={index} />)}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

function isRunning(part: ToolPart): boolean {
  return part.state !== "output-available" && part.state !== "output-error"
}

function toolLabel(part: ToolPart): string {
  return part.title ?? part.toolName
}

/** The first text argument (a query, a URL) identifies a call at a glance. */
function inputSummary(input: unknown): string {
  if (typeof input === "string") return input
  if (!input || typeof input !== "object") return ""
  for (const value of Object.values(input)) {
    if (typeof value === "string" && value.trim()) return value
    if (Array.isArray(value) && typeof value[0] === "string") return value.length > 1 ? `${value[0]} +${value.length - 1}` : value[0]
  }
  return ""
}

function ToolCall({ part, index }: { part: ToolPart; index: number }) {
  const { t } = useTranslation()
  const failed = part.state === "output-error"
  const done = part.state === "output-available"
  const output = done ? (typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2)) : failed ? part.errorText : ""
  const summary = inputSummary(part.input)
  return (
    <li className="min-w-0">
      <Collapsible defaultOpen={failed}>
        <CollapsibleTrigger className="group/call flex min-h-8 w-full min-w-0 items-center gap-2 rounded-sm px-1 text-left text-xs hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          <span className="w-5 shrink-0 text-foreground/40 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
          <code className="shrink-0 font-mono text-[11px] text-foreground/70">{toolLabel(part)}</code>
          <span className="min-w-0 flex-1 truncate text-foreground/40">{summary}</span>
          {failed ? (
            <span className={cn(caption, "text-destructive")}>{t("components.toolCall.failed")}</span>
          ) : done ? (
            <span className={caption}>{t("components.toolCall.completed")}</span>
          ) : (
            <Shimmer className={caption}>{t("components.toolCall.running")}</Shimmer>
          )}
          <ChevronRightIcon
            aria-hidden="true"
            className="size-3 shrink-0 text-foreground/40 group-data-[panel-open]/call:rotate-90 motion-safe:transition-transform motion-safe:duration-150"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="transition-none">
          {/* Indented to the tool name, past the index column. */}
          <div className="flex min-w-0 flex-col gap-3 pt-1 pr-1 pb-3 pl-8">
            {part.input !== undefined && <ToolData label={t("components.toolCall.input")}>{JSON.stringify(part.input, null, 2)}</ToolData>}
            {output && (
              <ToolData label={failed ? t("components.toolCall.error") : t("components.toolCall.output")} failed={failed}>
                {output}
              </ToolData>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

function ToolData({ label, failed = false, children }: { label: string; failed?: boolean; children: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <h4 className={cn(caption, failed && "text-destructive")}>{label}</h4>
      <pre
        className={cn(
          "max-h-60 overflow-auto rounded-sm p-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap",
          failed ? "bg-destructive/5 text-destructive" : "bg-muted/60 text-foreground/70"
        )}
      >
        {children}
      </pre>
    </section>
  )
}

export function Attachments({ files, align }: { files: FilePart[]; align: "start" | "end" }) {
  const images = files.filter((f) => f.mediaType.startsWith("image/"))
  const others = files.filter((f) => !f.mediaType.startsWith("image/"))
  return (
    <div className={cn("flex w-full flex-col gap-2", align === "end" ? "items-end" : "items-start")}>
      {images.length > 0 && (
        <div className="flex max-w-full gap-2 overflow-x-auto">
          <PhotoProvider>
            {images.map((file, i) => (
              <PhotoView src={file.url} key={i}>
                <img src={file.url} alt={file.filename ?? ""} loading="lazy" className="max-h-60 max-w-80 cursor-zoom-in rounded-lg border object-contain" />
              </PhotoView>
            ))}
          </PhotoProvider>
        </div>
      )}
      {others.length > 0 && (
        <AttachmentGroup className={align === "end" ? "justify-end" : undefined}>
          {others.map((file, i) => {
            const size = fileMetaOf(file)?.size
            return (
              <Attachment key={i} state="done">
                <AttachmentMedia variant="icon">
                  <FileIcon />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{file.filename ?? file.url}</AttachmentTitle>
                  <AttachmentDescription>{size ? formatBytes(size) : file.mediaType}</AttachmentDescription>
                </AttachmentContent>
                <AttachmentTrigger render={<a href={file.url} target="_blank" rel="noopener noreferrer" />}>
                  <span className="sr-only">{file.filename ?? file.url}</span>
                </AttachmentTrigger>
              </Attachment>
            )
          })}
        </AttachmentGroup>
      )}
    </div>
  )
}

function Sources({ sources }: { sources: Source[] }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 flex-col gap-1 pt-1">
      <Separator />
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="group/sources flex min-h-8 max-w-full items-center gap-2 rounded-sm px-1 text-xs text-foreground/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRightIcon
            aria-hidden="true"
            className="size-3 shrink-0 group-data-[panel-open]/sources:rotate-90 motion-safe:transition-transform motion-safe:duration-150"
          />
          <span>
            {t("pages.chat.sources")}{" "}
            <span className="tabular-nums">
              {sources.length.toLocaleString()}
            </span>
          </span>
          <AvatarGroup aria-hidden="true" className="-space-x-1!">
            {sources.slice(0, 5).map((source) => (
              <SourceFavicon key={source.number} source={source} />
            ))}
          </AvatarGroup>
        </CollapsibleTrigger>
        <CollapsibleContent className="transition-none">
          <ul className="flex min-w-0 flex-col py-1">
            {sources.map((source) => (
              <li key={source.number} className="min-w-0">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={source.title?.trim() || source.url}
                  className="group/source flex min-h-7 min-w-0 items-center gap-2 rounded-sm px-1 py-1 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span aria-hidden="true">
                    <SourceFavicon source={source} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs leading-5">
                    <span className="mr-1.5 text-foreground/40 tabular-nums">
                      [{source.number}]
                    </span>
                    {source.title?.trim() || source.url}
                  </span>
                  <ArrowUpRightIcon
                    aria-hidden="true"
                    className="size-3 shrink-0 text-foreground/40 group-hover/source:text-foreground/70"
                  />
                </a>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

/** Shared by the collapsed preview and source rows, with a fallback for missing icons. */
function SourceFavicon({ source }: { source: Source }) {
  const hostname = URL.canParse(source.url) ? new URL(source.url).hostname : ""
  // Gemini can return a Google redirect URL with the actual domain as its title.
  const domain =
    hostname === "vertexaisearch.cloud.google.com"
      ? /^[a-z\d.-]+\.[a-z]{2,}$/i.test(source.title?.trim() ?? "")
        ? source.title!.trim()
        : ""
      : hostname
  return (
    <Avatar size="sm" className="size-4! bg-stone-50">
      <AvatarImage
        src={
          domain
            ? `https://a.favicon.im/${encodeURIComponent(domain)}?throw-error-on-404=true`
            : undefined
        }
        alt=""
        width={16}
        height={16}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="p-0.5"
      />
      <AvatarFallback>
        <GlobeIcon aria-hidden="true" className="size-2.5" />
      </AvatarFallback>
    </Avatar>
  )
}
