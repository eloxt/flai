// Adapted from thesysdev/open-intelligent-ui (MIT): src/lib/components/html-view.tsx.
import { defineComponent, useIsStreaming } from "@openuidev/react-lang"
import { PlayIcon, SquareIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { useTheme } from "~/components/theme-provider"
import { Button } from "~/components/ui/button"

// The page runs in a sandboxed iframe: scripts only, an opaque origin (no
// allow-same-origin, so no access to this app, its tokens or storage), no
// forms, popups or navigation of the app. Its CSP allows inline code and
// data/blob media, and no network at all.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ")

const MAX_HTML = 200_000
const MIN_HEIGHT = 80
const MAX_HEIGHT = 2400
const AUTO_START = 360
const HEIGHT_MESSAGE = "flai-html-view-height"

// Reports the content height to the parent, so the view fits the page.
const REPORTER = `<script>(function(){var last=0;function send(){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(Math.abs(h-last)>1){last=h;parent.postMessage({type:"${HEIGHT_MESSAGE}",height:h},"*")}}addEventListener("load",send);new ResizeObserver(send).observe(document.documentElement);send()})()</script>`

function documentFor(html: string, scheme: "light" | "dark") {
  // The policy comes first, so it covers everything in the model's markup.
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:${scheme}}html,body{margin:0}body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}</style>${REPORTER}${html}`
}

function HtmlFrame({
  html,
  height,
  title,
}: {
  html: string
  height?: number | null
  title?: string | null
}) {
  const { t } = useTranslation()
  const streaming = useIsStreaming()
  const { resolved } = useTheme()
  const frame = useRef<HTMLIFrameElement>(null)
  // Runs only on request: a loop in model code could otherwise stall the app, and old replies stay idle.
  const [run, setRun] = useState<{ srcDoc: string } | null>(null)
  const [measured, setMeasured] = useState<number | null>(null)
  const fixed =
    typeof height === "number" && height > 0
      ? Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height))
      : null
  const tooLarge = html.length > MAX_HTML

  useEffect(() => {
    if (!run || fixed) return
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const data = event.data as { type?: unknown; height?: unknown }
      if (
        data?.type === HEIGHT_MESSAGE &&
        typeof data.height === "number" &&
        Number.isFinite(data.height)
      ) {
        setMeasured(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, data.height)))
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [run, fixed])

  const label = title || t("components.genui.title")
  return (
    <div className="w-full min-w-0 border border-(--genui-line) bg-(--background)">
      <div className="flex items-center gap-2 border-b border-(--genui-line) px-3 py-1.5 text-sm">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {run ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setRun(null)
              setMeasured(null)
            }}
          >
            <SquareIcon />
            {t("components.genui.stop")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={streaming || tooLarge || !html}
            onClick={() => setRun({ srcDoc: documentFor(html, resolved) })}
          >
            <PlayIcon />
            {t("components.genui.run")}
          </Button>
        )}
      </div>
      {run ? (
        <iframe
          ref={frame}
          title={label}
          sandbox="allow-scripts"
          srcDoc={run.srcDoc}
          referrerPolicy="no-referrer"
          className="block w-full border-0"
          style={{ height: fixed ?? measured ?? AUTO_START }}
        />
      ) : streaming || tooLarge ? (
        <p className="px-3 py-6 text-center text-sm text-(--genui-ink) opacity-60">
          {t(
            streaming
              ? "components.genui.preparing"
              : "components.genui.tooLarge"
          )}
        </p>
      ) : null}
    </div>
  )
}

export const HtmlView = defineComponent({
  name: "HtmlView",
  props: z.object({
    html: z.string(),
    height: z.number().optional(),
    title: z.string().optional(),
  }),
  description:
    "Sandboxed HTML page with inline JS and CSS, for a game, canvas or animation that needs a loop. No network: no external scripts, styles, fonts or images. It runs when the user presses Run. Fits its content unless height is set.",
  component: ({ props }) => (
    <HtmlFrame
      html={props.html ?? ""}
      height={props.height}
      title={props.title}
    />
  ),
})
