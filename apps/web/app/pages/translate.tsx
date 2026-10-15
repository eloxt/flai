import type { FileRecord, TranslateInput } from "@flai/shared"
import { ArrowLeftRightIcon, ImagePlusIcon, SquareIcon, XIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "~/components/ui/button"
import { Field, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Spinner } from "~/components/ui/spinner"
import { Textarea } from "~/components/ui/textarea"
import i18n from "~/i18n"
import { apiFetch, errorText } from "~/lib/api"
import { notify } from "~/lib/notify"
import { parseUIMessageStream } from "~/lib/ui-stream"
import { uploadFile } from "~/lib/upload"
import { useModelStore } from "~/store/model-store"
import { useTranslateStore } from "~/store/translate-store"

export const meta = () => [{ title: `FlaiChat - ${i18n.t("pages.translate.title")}` }]

const MAX_IMAGES = 5

export default function TranslatePage() {
  const { t } = useTranslation()
  const languages = useMemo(() => t("pages.translate.languages", { returnObjects: true }) as string[], [t])
  const prefs = useTranslateStore()
  const source = languages.includes(prefs.source) ? prefs.source : t("pages.translate.defaults.source")
  const target = languages.includes(prefs.target) ? prefs.target : t("pages.translate.defaults.target")
  const [text, setText] = useState("")
  const [output, setOutput] = useState("")
  const [images, setImages] = useState<FileRecord[]>([])
  const [uploading, setUploading] = useState(0)
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const addImages = async (files: File[]) => {
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        notify.error(t("common.fileTypeNotAllowed"))
        continue
      }
      if (images.length + uploading >= MAX_IMAGES) {
        notify.error(t("pages.translate.errors.maxImages"))
        return
      }
      setUploading((n) => n + 1)
      try {
        const record = await uploadFile(file)
        setImages((list) => (list.length >= MAX_IMAGES ? list : [...list, record]))
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
    if (!text.trim() && images.length === 0) return notify.error(t("pages.translate.errors.emptyInput"))
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
      const res = await apiFetch("/translate", { method: "POST", body, signal: controller.signal })
      if (!res.body) throw new Error(t("pages.translate.errors.noStream"))
      for await (const chunk of parseUIMessageStream(res.body)) {
        if (chunk.type === "text-delta") setOutput((o) => o + chunk.delta)
        else if (chunk.type === "error") throw new Error(chunk.errorText)
        else if (chunk.type === "finish") finished = true
      }
      if (!finished) throw new Error(t("pages.translate.errors.failed"))
    } catch (error) {
      if (!controller.signal.aborted) notify.error(errorText(error, t("pages.translate.errors.failed")))
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

  const LanguageSelect = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <Select value={value} onValueChange={(v) => onChange(String(v))}>
      <SelectTrigger className="w-full sm:w-44" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {languages.map((lang) => (
            <SelectItem key={lang} value={lang}>
              {lang}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8 md:py-16">
        <h1 className="text-4xl leading-none font-light tracking-tight md:text-5xl">{t("pages.translate.title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSelect value={source} onChange={(v) => prefs.set({ source: v })} label={t("pages.translate.sourceLanguage")} />
          <Button variant="ghost" size="icon" aria-label={t("pages.translate.swap")} disabled={running} onClick={swap}>
            <ArrowLeftRightIcon />
          </Button>
          <LanguageSelect value={target} onChange={(v) => prefs.set({ target: v })} label={t("pages.translate.targetLanguage")} />
          <div className="ml-auto flex gap-2">
            {running ? (
              <Button variant="destructive" onClick={stop}>
                <SquareIcon data-icon="inline-start" />
                {t("pages.translate.stop")}
              </Button>
            ) : (
              <Button onClick={() => void translate()} disabled={uploading > 0}>
                {t("pages.translate.translate")}
              </Button>
            )}
          </div>
        </div>
        <Field>
          <FieldLabel htmlFor="tr-instruction">{t("pages.translate.customInstructionLabel")}</FieldLabel>
          <Input
            id="tr-instruction"
            maxLength={500}
            value={prefs.instruction}
            placeholder={t("pages.translate.customInstructionPlaceholder")}
            onChange={(e) => prefs.set({ instruction: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8">
          <div className="flex flex-col gap-2">
            <Textarea
              className="min-h-72 flex-1 resize-y text-[15px]"
              value={text}
              placeholder={t("pages.translate.sourcePlaceholder")}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !running) void translate()
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"))
                if (files.length) {
                  e.preventDefault()
                  void addImages(files)
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              {images.map((image) => (
                <div key={image.id} className="relative">
                  <img src={image.url} alt={image.name} className="size-16 rounded-sm border object-cover" />
                  <Button
                    variant="secondary"
                    size="icon-xs"
                    className="absolute -top-2 -right-2 rounded-sm"
                    aria-label={t("pages.translate.removeImage")}
                    onClick={() => setImages((list) => list.filter((i) => i.id !== image.id))}
                  >
                    <XIcon />
                  </Button>
                </div>
              ))}
              {uploading > 0 && <Spinner />}
              <input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={(e) => {
                void addImages(Array.from(e.target.files ?? []))
                e.target.value = ""
              }} />
              {images.length < MAX_IMAGES && (
                <Button variant="outline" size="sm" onClick={() => imageInput.current?.click()}>
                  <ImagePlusIcon data-icon="inline-start" />
                  {t("pages.translate.addImage")}
                </Button>
              )}
            </div>
          </div>
          <Textarea
            className="min-h-72 resize-y bg-muted text-[15px]"
            value={output}
            placeholder={running ? t("pages.translate.streamingPlaceholder") : t("pages.translate.targetPlaceholder")}
            onChange={(e) => setOutput(e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
