import type { AskUserAnswer, FlaiPart, MessageMetadata } from "@flai/shared"
import { askUserQuestionSchema, askUserResultSchema, fileMetaOf, isAskUserPart } from "@flai/shared"
import { cn } from "cn"
import { ArrowUpRightIcon, CheckIcon, ChevronRightIcon, FileIcon, GlobeIcon, WrenchIcon, XCircleIcon } from "lucide-react"
import { lazy, memo, Suspense, useEffect, useMemo, useState } from "react"
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
      {visible.map((part, i) => {
        const isLast = i === visible.length - 1
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
          case "reasoning":
            return <Reasoning key={i} text={part.text} active={streaming && isLast} />
          case "file":
            return <Attachments key={i} files={[part]} align="start" />
          case "dynamic-tool":
            return <ToolCard key={i} part={part} />
          default:
            if (part.type.startsWith("tool-")) return <ToolCard key={i} part={toDynamic(part)} />
            return null
        }
      })}
      {sources.length > 0 && <Sources sources={sources} />}
    </div>
  )
})

function toDynamic(part: FlaiPart): ToolPart {
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
function Shimmer({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation()
  return <span className="w-fit text-sm text-muted-foreground text-shimmer">{children ?? t("pages.chat.pending")}</span>
}

function Reasoning({ text, active }: { text: string; active: boolean }) {
  const { t } = useTranslation()
  // Open while the model is thinking, collapse once it moves on.
  const [open, setOpen] = useState(active)
  useEffect(() => setOpen(active), [active])
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group/reasoning flex items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronRightIcon className="size-3.5 transition-transform group-data-[panel-open]/reasoning:rotate-90" />
        {active ? <Shimmer>{t("pages.chat.reasoning.process")}</Shimmer> : t("pages.chat.reasoning.done")}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-l pl-4 text-muted-foreground">
          <Markdown light streaming={active}>
            {text}
          </Markdown>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ToolCard({ part }: { part: ToolPart }) {
  const { t } = useTranslation()
  const failed = part.state === "output-error"
  const done = part.state === "output-available"
  const running = !failed && !done
  const output = done ? (typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2)) : failed ? part.errorText : ""
  return (
    <Collapsible defaultOpen={failed} className="w-full rounded-lg border">
      <CollapsibleTrigger className="group/tool flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
        {failed ? (
          <XCircleIcon className="size-4 text-destructive" />
        ) : done ? (
          <CheckIcon className="size-4 text-muted-foreground" />
        ) : (
          <WrenchIcon className="size-4 text-muted-foreground" />
        )}
        {running ? (
          <Shimmer>{t("components.toolCall.callingTool")}</Shimmer>
        ) : (
          <span className="text-muted-foreground">{failed ? t("components.toolCall.failed") : t("components.toolCall.completed")}</span>
        )}
        <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">{part.title ?? part.toolName}</code>
        <ChevronRightIcon className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/tool:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 border-t px-3 py-2">
          {part.input !== undefined && (
            <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">{JSON.stringify(part.input, null, 2)}</pre>
          )}
          {output && (
            <pre className={cn("max-h-60 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap", failed ? "bg-destructive/10 text-destructive" : "bg-muted")}>
              {output}
            </pre>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
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
