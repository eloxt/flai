import type { ExplainInput, TranslateInput } from "@flai/shared"
import { cn } from "cn"
import {
  CheckIcon,
  CopyIcon,
  LanguagesIcon,
  LightbulbIcon,
  QuoteIcon,
} from "lucide-react"
import { type RefObject, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { Markdown } from "~/components/markdown"
import { Button } from "~/components/ui/button"
import { Spinner } from "~/components/ui/spinner"
import i18n from "~/i18n"
import { apiFetch, errorText } from "~/lib/api"
import { notify } from "~/lib/notify"
import { parseUIMessageStream } from "~/lib/ui-stream"
import { useChatStore } from "../chat-store"
import { useInputStore } from "~/store/input-store"
import { useModelStore } from "~/store/model-store"
import { useTranslateStore } from "~/store/translate-store"

interface Selection {
  text: string
  range: Range
}

const MARGIN = 8
const PANEL_WIDTH = 320

/** A small toolbar over text selected inside `containerRef`: copy it, or ask what it means. */
export function SelectionPopover({
  containerRef,
  context,
}: {
  containerRef: RefObject<HTMLElement | null>
  context: string
}) {
  const { t } = useTranslation()
  const [selection, setSelection] = useState<Selection | null>(null)
  const [pos, setPos] = useState<{
    left: number
    top: number
    below: boolean
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [kind, setKind] = useState<"explain" | "translate">("explain")
  const [explanation, setExplanation] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const pointerDown = useRef(false)

  const close = () => {
    abort.current?.abort()
    abort.current = null
    setSelection(null)
    setExplanation(null)
    setRunning(false)
    setCopied(false)
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const read = () => {
      const sel = window.getSelection()
      const text = sel?.toString().trim()
      if (!sel || sel.isCollapsed || !text || sel.rangeCount === 0) return null
      const range = sel.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) return null
      return { text, range: range.cloneRange() }
    }
    // Wait for the pointer to lift: the toolbar under a drag in progress would chase the cursor.
    const update = () => {
      if (pointerDown.current) return
      const next = read()
      setSelection((prev) => {
        if (next) {
          if (prev?.text !== next.text) {
            abort.current?.abort()
            abort.current = null
            setExplanation(null)
            setRunning(false)
            setCopied(false)
          }
          return next
        }
        // Clicking into the panel keeps the selection; anything else ends it.
        if (prev && panel.current?.contains(document.activeElement)) return prev
        abort.current?.abort()
        abort.current = null
        setExplanation(null)
        setRunning(false)
        return null
      })
    }
    const down = (e: PointerEvent) => {
      if (panel.current?.contains(e.target as Node)) return
      if (container.contains(e.target as Node)) pointerDown.current = true
      else update()
    }
    const up = () => {
      if (!pointerDown.current) return
      pointerDown.current = false
      setTimeout(update)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      else if (e.shiftKey || e.key === "a") update()
    }
    document.addEventListener("pointerdown", down)
    document.addEventListener("pointerup", up)
    document.addEventListener("keyup", key)
    return () => {
      document.removeEventListener("pointerdown", down)
      document.removeEventListener("pointerup", up)
      document.removeEventListener("keyup", key)
    }
  }, [containerRef])

  useEffect(() => () => abort.current?.abort(), [])

  // Follows the selection through scrolling and a growing explanation.
  useEffect(() => {
    if (!selection) return setPos(null)
    const place = () => {
      const rect = selection.range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      const height = panel.current?.offsetHeight ?? 40
      const below = rect.top - height - MARGIN < 0
      const width = panel.current?.offsetWidth ?? PANEL_WIDTH
      const left = Math.max(
        MARGIN,
        Math.min(
          rect.left + rect.width / 2 - width / 2,
          window.innerWidth - width - MARGIN
        )
      )
      setPos({
        left,
        top: below ? rect.bottom + MARGIN : rect.top - MARGIN,
        below,
      })
    }
    place()
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
    }
  }, [selection, explanation])

  if (!selection) return null

  const copy = async () => {
    await navigator.clipboard.writeText(selection.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const run = async (which: "explain" | "translate") => {
    const { selected } = useModelStore.getState()
    if (!selected) return notify.error(t("common.error.modelProviderNotFound"))
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setKind(which)
    setExplanation("")
    setRunning(true)
    const body: ExplainInput | TranslateInput =
      which === "explain"
        ? {
            model: selected,
            text: selection.text,
            context: context.slice(0, 6000),
            language: i18n.language,
          }
        : {
            model: selected,
            source: "Auto-detect",
            target: useTranslateStore.getState().target,
            text: selection.text,
          }
    let finished = false
    try {
      const res = await apiFetch(`/${which}`, {
        method: "POST",
        body,
        signal: controller.signal,
      })
      if (!res.body) throw new Error(t("pages.chat.selection.failed"))
      for await (const chunk of parseUIMessageStream(res.body)) {
        if (chunk.type === "text-delta")
          setExplanation((e) => (e ?? "") + chunk.delta)
        else if (chunk.type === "error") throw new Error(chunk.errorText)
        else if (chunk.type === "finish") finished = true
      }
      if (!finished) throw new Error(t("pages.chat.selection.failed"))
    } catch (error) {
      if (!controller.signal.aborted) {
        notify.error(errorText(error, t("pages.chat.selection.failed")))
        setExplanation(null)
      }
    } finally {
      if (abort.current === controller) {
        abort.current = null
        setRunning(false)
      }
    }
  }

  const quote = () => {
    const id = useChatStore.getState().conversationId
    if (!id) return
    const input = useInputStore.getState()
    const quoted = selection.text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")
    const draft = input.drafts[id] ?? ""
    input.setDraft(
      id,
      `${draft}${draft && !draft.endsWith("\n") ? "\n\n" : ""}${quoted}\n\n`
    )
    window.getSelection()?.removeAllRanges()
    close()
    const field = document.querySelector<HTMLTextAreaElement>(
      "textarea[data-chat-input]"
    )
    field?.focus()
    requestAnimationFrame(() =>
      field?.setSelectionRange(field.value.length, field.value.length)
    )
  }

  return createPortal(
    // The outer box only positions; the inner one animates, so the entrance never fights the placement transform.
    <div
      ref={panel}
      role="toolbar"
      // Keeps the text selected while the buttons are pressed.
      onMouseDown={(e) => e.preventDefault()}
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        width: explanation === null ? undefined : PANEL_WIDTH,
        transform: pos?.below ? undefined : "translateY(-100%)",
        visibility: pos ? "visible" : "hidden",
      }}
      className="fixed z-50 max-w-[calc(100vw-1rem)]"
    >
      <div
        className={cn(
          "flex flex-col gap-1 rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10",
          pos &&
            "animate-in duration-150 ease-out fade-in-0 zoom-in-95 motion-reduce:animate-none",
          pos?.below
            ? "origin-top slide-in-from-top-1"
            : "origin-bottom slide-in-from-bottom-1"
        )}
      >
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="sm" onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {t("pages.chat.selection.copy")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={running && kind === "explain"}
            aria-pressed={explanation !== null && kind === "explain"}
            className="disabled:opacity-100 aria-pressed:bg-muted"
            onClick={() => void run("explain")}
          >
            <LightbulbIcon />
            {t("pages.chat.selection.explain")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={running && kind === "translate"}
            aria-pressed={explanation !== null && kind === "translate"}
            className="disabled:opacity-100 aria-pressed:bg-muted"
            onClick={() => void run("translate")}
          >
            <LanguagesIcon />
            {t("pages.chat.selection.translate")}
          </Button>
          <Button variant="ghost" size="sm" onClick={quote}>
            <QuoteIcon />
            {t("pages.chat.selection.quote")}
          </Button>
        </div>
        {explanation !== null && (
          <div className="max-h-64 overflow-y-auto border-t px-2 py-1.5">
            {explanation ? (
              <Markdown light streaming={running} className="text-sm">
                {explanation}
              </Markdown>
            ) : (
              <Spinner />
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
