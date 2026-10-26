import type { FileRecord, TranslateInput } from "@flai/shared"
import {
  ArrowLeftRightIcon,
  ArrowRightIcon,
  CopyIcon,
  ImagePlusIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "~/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Spinner } from "~/components/ui/spinner"
import { Textarea } from "~/components/ui/textarea"
import i18n from "~/i18n"
import { apiFetch, errorText } from "~/lib/api"
import { notify } from "~/lib/notify"
import { parseUIMessageStream } from "~/lib/ui-stream"
import { uploadFile } from "~/lib/upload"
import { useModelStore } from "~/store/model-store"
import { useTranslateStore } from "~/store/translate-store"

export const links = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous" as const,
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500&display=swap",
  },
]

export const meta = () => [
  { title: `FlaiChat - ${i18n.t("pages.translate.title")}` },
]

const MAX_IMAGES = 5

export default function TranslatePage() {
  const { t } = useTranslation()
  const languages = useMemo(
    () => t("pages.translate.languages", { returnObjects: true }) as string[],
    [t]
  )
  const prefs = useTranslateStore()
  const source = languages.includes(prefs.source)
    ? prefs.source
    : t("pages.translate.defaults.source")
  const target = languages.includes(prefs.target)
    ? prefs.target
    : t("pages.translate.defaults.target")
  const [text, setText] = useState("")
  const [output, setOutput] = useState("")
  const [images, setImages] = useState<FileRecord[]>([])
  const [uploading, setUploading] = useState(0)
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const addImages = async (files: File[]) => {
    // State read here doesn't change during the loop, so count the slots this batch takes.
    let slots = MAX_IMAGES - images.length - uploading
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        notify.error(t("common.fileTypeNotAllowed"))
        continue
      }
      if (slots <= 0) {
        notify.error(t("pages.translate.errors.maxImages"))
        return
      }
      slots--
      setUploading((n) => n + 1)
      try {
        const record = await uploadFile(file)
        setImages((list) =>
          list.length >= MAX_IMAGES ? list : [...list, record]
        )
      } catch (error) {
        notify.error(error, t("common.uploadFailed"))
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  const translate = async () => {
    const { selected } = useModelStore.getState()
    if (!selected) return notify.error(t("common.error.modelProviderNotFound"))
    if (!text.trim() && images.length === 0)
      return notify.error(t("pages.translate.errors.emptyInput"))
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setOutput("")
    setRunning(true)
    const body: TranslateInput = {
      model: selected,
      source,
      target,
      text,
      imageFileIds: images.map((i) => i.id),
      instruction: prefs.instruction.trim() || undefined,
    }
    let finished = false
    try {
      const res = await apiFetch("/translate", {
        method: "POST",
        body,
        signal: controller.signal,
      })
      if (!res.body) throw new Error(t("pages.translate.errors.noStream"))
      for await (const chunk of parseUIMessageStream(res.body)) {
        if (chunk.type === "text-delta") setOutput((o) => o + chunk.delta)
        else if (chunk.type === "error") throw new Error(chunk.errorText)
        else if (chunk.type === "finish") finished = true
      }
      if (!finished) throw new Error(t("pages.translate.errors.failed"))
    } catch (error) {
      if (!controller.signal.aborted)
        notify.error(errorText(error, t("pages.translate.errors.failed")))
    } finally {
      if (abort.current === controller) {
        abort.current = null
        setRunning(false)
      }
    }
  }

  const stop = () => {
    abort.current?.abort()
    abort.current = null
    setRunning(false)
  }

  const swap = () => {
    prefs.set({ source: target, target: source })
    setText(output)
    setOutput(text)
    setImages([])
  }

  return (
    <main
      className="@container/translate min-h-0 flex-1 overflow-y-auto overscroll-contain"
      style={{ fontFamily: '"IBM Plex Sans", var(--font-sans)' }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 md:px-8">
        <h1 className="text-4xl leading-tight font-light tracking-tight text-balance md:text-5xl">
          {t("pages.translate.title")}
        </h1>

        <FieldGroup>
          <Field className="grid grid-cols-12 items-center gap-4">
            <FieldLabel
              htmlFor="tr-instruction"
              className="col-span-12 text-sm font-normal @2xl/translate:col-span-3"
            >
              {t("pages.translate.customInstructionLabel")}
            </FieldLabel>
            <Input
              id="tr-instruction"
              name="translationInstruction"
              autoComplete="off"
              className="col-span-12 min-h-12 rounded-none px-4 shadow-none @2xl/translate:col-span-9"
              maxLength={500}
              value={prefs.instruction}
              placeholder={t("pages.translate.customInstructionPlaceholder")}
              onChange={(e) => prefs.set({ instruction: e.target.value })}
            />
          </Field>
        </FieldGroup>

        <div className="grid grid-cols-12 border-y border-border border-t-foreground/40">
          <section
            aria-labelledby="tr-source-label"
            className="col-span-12 flex min-w-0 flex-col @2xl/translate:col-span-6 @2xl/translate:border-r"
          >
            <div className="flex min-h-20 flex-wrap items-center justify-between gap-2 border-b px-4 py-4 md:px-8">
              <label
                id="tr-source-label"
                htmlFor="tr-source"
                className="flex items-center gap-2 text-xs font-normal tracking-wide uppercase"
              >
                {t("pages.translate.sourceText")}
              </label>
              <div className="flex items-center gap-2">
                <Select
                  value={source}
                  disabled={running}
                  onValueChange={(value) =>
                    prefs.set({ source: String(value) })
                  }
                >
                  <SelectTrigger
                    className="min-h-11 w-28 rounded-none border-transparent px-2 focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t("pages.translate.sourceLanguage")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className="rounded-none border shadow-none ring-0"
                    alignItemWithTrigger={false}
                  >
                    <SelectGroup>
                      {languages.map((lang) => (
                        <SelectItem
                          key={lang}
                          value={lang}
                          className="min-h-11 rounded-none"
                        >
                          {lang}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11 rounded-none"
                  aria-label={t("pages.translate.swap")}
                  disabled={running}
                  onClick={swap}
                >
                  <ArrowLeftRightIcon aria-hidden="true" />
                </Button>
              </div>
            </div>
            <Textarea
              id="tr-source"
              name="sourceText"
              dir="auto"
              autoComplete="off"
              className="mx-auto min-h-64 max-w-[60ch] flex-1 resize-y rounded-none border-0 px-4 py-8 text-base leading-relaxed shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:min-h-80 md:px-8 md:text-base"
              value={text}
              placeholder={t("pages.translate.sourcePlaceholder")}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.metaKey || e.ctrlKey) &&
                  !e.nativeEvent.isComposing &&
                  !running &&
                  uploading === 0
                ) {
                  e.preventDefault()
                  void translate()
                }
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files).filter((f) =>
                  f.type.startsWith("image/")
                )
                if (files.length && !running) void addImages(files)
              }}
            />
            {(images.length > 0 || uploading > 0) && (
              <div className="flex flex-wrap items-center gap-4 px-4 pb-4 md:px-8">
                {images.map((image) => (
                  <div key={image.id} className="relative border bg-muted">
                    <img
                      src={image.url}
                      alt={image.name}
                      width={80}
                      height={80}
                      className="size-20 object-cover"
                    />
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute top-0 right-0 size-11 rounded-none"
                      aria-label={t("pages.translate.removeImage")}
                      disabled={running}
                      onClick={() =>
                        setImages((list) =>
                          list.filter((i) => i.id !== image.id)
                        )
                      }
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                {uploading > 0 && (
                  <Spinner
                    className="motion-reduce:animate-none"
                    aria-label={t("common.uploading")}
                  />
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-4 text-xs text-foreground/70 md:px-8">
              <span className="tabular-nums">
                {t("pages.translate.characters", {
                  count: Array.from(text).length,
                })}
              </span>
              <span>
                {t("pages.translate.imageLimit", { count: MAX_IMAGES })}
              </span>
            </div>
            <div className="flex min-h-20 flex-wrap items-center justify-between gap-2 border-t px-4 py-4 md:px-8">
              <input
                ref={imageInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={running}
                onChange={(e) => {
                  void addImages(Array.from(e.target.files ?? []))
                  e.target.value = ""
                }}
              />
              <Button
                variant="ghost"
                className="min-h-11 rounded-none px-2"
                disabled={running || images.length + uploading >= MAX_IMAGES}
                onClick={() => imageInput.current?.click()}
              >
                <ImagePlusIcon aria-hidden="true" data-icon="inline-start" />
                {t("pages.translate.addImage")}
              </Button>
              {running ? (
                <Button
                  variant="outline"
                  className="min-h-11 min-w-28 rounded-none px-4"
                  onClick={stop}
                >
                  <SquareIcon aria-hidden="true" data-icon="inline-start" />
                  {t("pages.translate.stop")}
                </Button>
              ) : (
                <Button
                  className="min-h-11 min-w-28 rounded-none px-4"
                  onClick={() => void translate()}
                  disabled={uploading > 0}
                >
                  {t("pages.translate.translate")}
                  <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
                </Button>
              )}
            </div>
          </section>

          <section
            aria-labelledby="tr-output-label"
            className="col-span-12 flex min-w-0 flex-col border-t bg-muted/50 @2xl/translate:col-span-6 @2xl/translate:border-t-0"
          >
            <div className="flex min-h-20 flex-wrap items-center justify-between gap-2 border-b px-4 py-4 md:px-8">
              <label
                id="tr-output-label"
                htmlFor="tr-output"
                className="flex items-center gap-2 text-xs font-normal tracking-wide uppercase"
              >
                {t("pages.translate.targetText")}
              </label>
              <Select
                value={target}
                disabled={running}
                onValueChange={(value) => prefs.set({ target: String(value) })}
              >
                <SelectTrigger
                  className="min-h-11 w-28 rounded-none border-transparent px-2 focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t("pages.translate.targetLanguage")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  className="rounded-none border shadow-none ring-0"
                  alignItemWithTrigger={false}
                >
                  <SelectGroup>
                    {languages.map((lang) => (
                      <SelectItem
                        key={lang}
                        value={lang}
                        className="min-h-11 rounded-none"
                      >
                        {lang}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              id="tr-output"
              name="translatedText"
              dir="auto"
              autoComplete="off"
              className="mx-auto min-h-64 max-w-[60ch] flex-1 resize-y rounded-none border-0 px-4 py-8 text-base leading-relaxed shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:min-h-80 md:px-8 md:text-base"
              value={output}
              readOnly={running}
              aria-busy={running}
              placeholder={
                running
                  ? t("pages.translate.streamingPlaceholder")
                  : t("pages.translate.targetPlaceholder")
              }
              onChange={(e) => setOutput(e.target.value)}
            />
            <div className="flex items-center px-4 pb-4 text-xs text-foreground/70 md:px-8">
              <span className="tabular-nums">
                {t("pages.translate.characters", {
                  count: Array.from(output).length,
                })}
              </span>
            </div>
            <div className="flex min-h-20 flex-wrap items-center justify-between gap-2 border-t px-4 py-4 md:px-8">
              <p
                role="status"
                className="flex items-center gap-2 text-xs text-foreground/70"
              >
                {running && (
                  <Spinner
                    aria-hidden="true"
                    className="text-brand motion-reduce:animate-none"
                  />
                )}
                {running
                  ? t("pages.translate.translating")
                  : output
                    ? t("pages.translate.editableResult")
                    : t("pages.translate.awaitingInput")}
              </p>
              <Button
                variant="ghost"
                className="min-h-11 rounded-none px-2"
                disabled={!output || running}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(output)
                    notify.success(t("pages.translate.copied"))
                  } catch (error) {
                    notify.error(error, t("pages.translate.errors.copyFailed"))
                  }
                }}
              >
                <CopyIcon aria-hidden="true" data-icon="inline-start" />
                {t("pages.translate.copyResult")}
              </Button>
            </div>
          </section>
        </div>

        <p className="hidden text-xs text-foreground/70 md:block">
          {t("pages.translate.shortcutHint")}
        </p>
      </div>
    </main>
  )
}
