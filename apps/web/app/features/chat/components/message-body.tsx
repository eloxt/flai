import type { FlaiPart, MessageMetadata } from "@flai/shared"
import { fileMetaOf } from "@flai/shared"
import { cn } from "cn"
import DOMPurify from "dompurify"
import { CheckIcon, ChevronRightIcon, FileIcon, WrenchIcon, XCircleIcon } from "lucide-react"
import { memo, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { PhotoProvider, PhotoView } from "react-photo-view"
import { GenuiBlock } from "~/components/genui/genui-block"
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
import { Markdown } from "~/components/markdown"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible"
import { Separator } from "~/components/ui/separator"
import { formatBytes } from "~/lib/format"
import { applyGoogleFootnotes } from "../grounding"
import { splitSegments } from "../segments"

type FilePart = Extract<FlaiPart, { type: "file" }>
type ToolPart = Extract<FlaiPart, { type: "dynamic-tool" }>
type SourcePart = Extract<FlaiPart, { type: "source-url" }>

interface MessageBodyProps {
  role: "user" | "assistant"
  parts: FlaiPart[]
  metadata?: MessageMetadata
  /** True while this message is being generated. */
  streaming?: boolean
  /** Continue the conversation from a GenUI action; omitted where replies aren't possible. */
  onSend?: (text: string) => void
}

export const MessageBody = memo(function MessageBody({ role, parts, metadata, streaming = false, onSend }: MessageBodyProps) {
  const grounding = metadata?.googleGrounding
  // Footnotes are derived for display only; stored text stays untouched.
  const texts = useMemo(() => {
    const raw = parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text)
    return role === "assistant" ? applyGoogleFootnotes(raw, grounding) : raw
  }, [parts, grounding, role])

  if (role === "user") return <UserBody parts={parts} />

  let textIndex = 0
  const sources = parts.filter((p): p is SourcePart => p.type === "source-url")
  const visible = parts.filter((p) => p.type !== "source-url" && p.type !== "step-start")
  const pending = streaming && visible.length === 0

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {pending && <Shimmer />}
      {visible.map((part, i) => {
        const isLast = i === visible.length - 1
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
      {grounding?.searchEntryPoint?.renderedContent && !streaming && (
        <SearchEntryPoint html={grounding.searchEntryPoint.renderedContent} />
      )}
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
          <GenuiBlock key={i} code={segment.code} streaming={streaming && !segment.complete} onSend={onSend} />
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

function Sources({ sources }: { sources: SourcePart[] }) {
  return (
    <div className="flex flex-col gap-2 pt-1">
      <Separator />
      <div className="flex flex-wrap gap-2">
        {sources.map((s, i) => (
          <a
            key={s.sourceId + i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title={s.title ?? s.url}
            className="flex max-w-full items-center gap-1 truncate rounded-md bg-secondary/60 px-2 py-1 text-xs transition-colors hover:bg-secondary"
          >
            <span className="opacity-70">[{i + 1}]</span>
            <span className="max-w-40 truncate">{s.title || new URL(s.url).hostname}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

/** Google requires showing its search suggestions widget; sanitize the provided HTML. */
function SearchEntryPoint({ html }: { html: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html, { ADD_TAGS: ["style"], FORBID_ATTR: ["onerror", "onclick"] }), [html])
  return (
    <div className="flex flex-col gap-2 pt-1">
      <Separator />
      <div className="max-w-full overflow-x-auto" dangerouslySetInnerHTML={{ __html: clean }} />
    </div>
  )
}
