import type { AdminProvider, SettingValue } from "@flai/shared"
import { type FormEvent, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { PanelSection } from "~/components/panel-dialog"
import { Button } from "~/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "~/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import { Spinner } from "~/components/ui/spinner"
import { Textarea } from "~/components/ui/textarea"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"

/** Load and save one `/admin/settings/:key` document. */
function useSetting<K extends "system_prompt" | "title_generation" | "error_alert">(key: K) {
  const [value, setValue] = useState<SettingValue<K> | null>(null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const load = () => {
    setFailed(false)
    api<SettingValue<K>>(`/admin/settings/${key}`)
      .then(setValue)
      .catch((e) => {
        setFailed(true)
        notify.error(e)
      })
  }
  useEffect(load, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (next: SettingValue<K>, success: string) => {
    setSaving(true)
    try {
      setValue(await api<SettingValue<K>>(`/admin/settings/${key}`, { method: "PUT", body: next }))
      notify.success(success)
    } catch (error) {
      notify.error(error)
    } finally {
      setSaving(false)
    }
  }
  return { value, setValue, failed, saving, load, save }
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyDescription>{t("pages.admin.systemConfig.unavailable")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onRetry}>
          {t("pages.admin.systemConfig.reload")}
        </Button>
      </EmptyContent>
    </Empty>
  )
}

export function SystemPromptSettings() {
  const { t } = useTranslation()
  const { value, setValue, failed, saving, load, save } = useSetting("system_prompt")
  if (failed) return <LoadFailed onRetry={load} />
  return (
    <PanelSection title={t("pages.admin.systemConfig.systemPrompt")} description={t("pages.admin.systemConfig.systemPromptHelp")}>
      {!value ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void save(value, t("pages.admin.systemConfig.saved"))
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="sp-chat">{t("pages.admin.systemConfig.chatPrompt")}</FieldLabel>
              <Textarea id="sp-chat" rows={10} value={value.chat} onChange={(e) => setValue({ ...value, chat: e.target.value })} />
              <FieldDescription>{t("pages.admin.systemConfig.chatPromptHelp")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="sp-translate">{t("pages.admin.systemConfig.translatePrompt")}</FieldLabel>
              <Textarea id="sp-translate" rows={6} value={value.translate} onChange={(e) => setValue({ ...value, translate: e.target.value })} />
              <FieldDescription>{t("pages.admin.systemConfig.translatePromptHelp")}</FieldDescription>
            </Field>
            <Button type="submit" className="mt-2 self-start" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {t("common.actions.save")}
            </Button>
          </FieldGroup>
        </form>
      )}
    </PanelSection>
  )
}

export function TitleGenerationSettings() {
  const { t } = useTranslation()
  const { value, setValue, failed, saving, load, save } = useSetting("title_generation")
  const [providers, setProviders] = useState<AdminProvider[]>([])
  useEffect(() => {
    api<AdminProvider[]>("/admin/providers").then((list) => setProviders(list.filter((p) => p.isActive))).catch(() => {})
  }, [])
  if (failed) return <LoadFailed onRetry={load} />
  const provider = providers.find((p) => p.id === value?.providerId)
  return (
    <PanelSection title={t("pages.admin.systemConfig.titleGeneration")} description={t("pages.admin.systemConfig.titleHelp")}>
      {!value ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void save(value, t("pages.admin.systemConfig.saved"))
          }}
        >
          <FieldGroup>
            <div className="grid gap-6 sm:grid-cols-2 sm:gap-x-4">
              <Field>
                <FieldLabel>{t("pages.admin.systemConfig.provider")}</FieldLabel>
                <Select value={value.providerId || null} onValueChange={(v) => setValue({ ...value, providerId: String(v ?? ""), modelId: "" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("pages.admin.systemConfig.selectProvider")}>
                      {(v: string) => providers.find((p) => p.id === v)?.name ?? v}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t("pages.admin.systemConfig.model")}</FieldLabel>
                <Select value={value.modelId || null} disabled={!provider} onValueChange={(v) => setValue({ ...value, modelId: String(v ?? "") })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("pages.admin.systemConfig.selectModel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {provider?.models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name || m.id}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>{t("pages.admin.systemConfig.modelHelp")}</FieldDescription>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="tg-prompt">{t("pages.admin.systemConfig.titlePrompt")}</FieldLabel>
              <Textarea id="tg-prompt" rows={6} value={value.prompt} onChange={(e) => setValue({ ...value, prompt: e.target.value })} />
            </Field>
            <Button type="submit" className="mt-2 self-start" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {t("common.actions.save")}
            </Button>
          </FieldGroup>
        </form>
      )}
    </PanelSection>
  )
}

export function ErrorAlertSettings() {
  const { t } = useTranslation()
  const { value, setValue, failed, saving, load, save } = useSetting("error_alert")
  if (failed) return <LoadFailed onRetry={load} />
  return (
    <PanelSection title={t("pages.admin.errorAlert.title")} description={t("pages.admin.errorAlert.description")}>
      {!value ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <form
          className="max-w-xl"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void save(value, t("pages.admin.systemConfig.saved"))
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="bark-url">{t("pages.admin.errorAlert.urlLabel")}</FieldLabel>
              <Input id="bark-url" type="url" value={value.barkUrl} placeholder={t("pages.admin.errorAlert.placeholder")} onChange={(e) => setValue({ barkUrl: e.target.value })} />
              <FieldDescription>{t("pages.admin.errorAlert.help")}</FieldDescription>
            </Field>
            <Button type="submit" className="mt-2 self-start" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {t("common.actions.save")}
            </Button>
          </FieldGroup>
        </form>
      )}
    </PanelSection>
  )
}
