import type { AdminProvider, SettingKey, SettingValue } from "@flai/shared"
import { type FormEvent, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { PanelSection } from "~/components/panel-dialog"
import { Button } from "~/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "~/components/ui/empty"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import { Spinner } from "~/components/ui/spinner"
import { Switch } from "~/components/ui/switch"
import { Textarea } from "~/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"
import { useModelStore } from "~/store/model-store"

/** Load and save one `/admin/settings/:key` document. */
function useSetting<K extends SettingKey>(key: K) {
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
      return true
    } catch (error) {
      notify.error(error)
      return false
    } finally {
      setSaving(false)
    }
  }
  return { value, setValue, failed, saving, load, save }
}

export function WebSearchSettings() {
  const { t } = useTranslation()
  const { value, setValue, failed, saving, load, save } = useSetting("web_search")
  const p = "pages.admin.webSearch"
  if (failed) return <LoadFailed onRetry={load} />
  return (
    <PanelSection title={t(`${p}.title`)} description={t(`${p}.description`)}>
      {!value ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <form
          className="max-w-xl"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault()
            if (await save(value, t("pages.admin.systemConfig.saved"))) {
              await useModelStore.getState().load().catch(notify.error)
            }
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel id="search-provider-label">{t(`${p}.provider`)}</FieldLabel>
              <ToggleGroup
                aria-labelledby="search-provider-label"
                variant="outline"
                value={[value.provider]}
                disabled={saving}
                className="flex-wrap"
                onValueChange={(values) => {
                  const provider = values[0]
                  if (provider === "native" || provider === "exa") setValue({ ...value, provider })
                }}
              >
                <ToggleGroupItem value="native">{t(`${p}.native`)}</ToggleGroupItem>
                <ToggleGroupItem value="exa">Exa</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>{t(`${p}.${value.provider}Help`)}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="exa-api-key">Exa API Key</FieldLabel>
              <Input
                id="exa-api-key"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                required={value.provider === "exa"}
                disabled={saving}
                value={value.exaApiKey}
                onChange={(e) => setValue({ ...value, exaApiKey: e.target.value })}
              />
              <FieldDescription>{t(`${p}.keyHelp`)}</FieldDescription>
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

export function TopicCheckSettings() {
  const { t } = useTranslation()
  const { value, setValue, failed, saving, load, save } = useSetting("topic_check")
  const p = "pages.admin.topicCheck"
  if (failed) return <LoadFailed onRetry={load} />
  return (
    <PanelSection title={t(`${p}.title`)} description={t(`${p}.description`)}>
      {!value ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <form
          className="max-w-xl"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void save(value, t("pages.admin.systemConfig.saved"))
          }}
        >
          <FieldGroup>
            <Field orientation="horizontal" className="items-center">
              <FieldContent>
                <FieldLabel htmlFor="topic-check-enabled">{t(`${p}.enabled`)}</FieldLabel>
              </FieldContent>
              <Switch
                id="topic-check-enabled"
                checked={value.enabled}
                disabled={saving}
                onCheckedChange={(enabled) => setValue({ ...value, enabled })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="typesafe-base-url">Base URL</FieldLabel>
              <Input
                id="typesafe-base-url"
                type="url"
                spellCheck={false}
                required
                disabled={saving}
                placeholder="https://api.typesafe.ai"
                value={value.baseUrl}
                onChange={(e) => setValue({ ...value, baseUrl: e.target.value })}
              />
              <FieldDescription>{t(`${p}.baseUrlHelp`, { baseUrl: value.baseUrl.replace(/\/+$/, "") || "https://api.typesafe.ai" })}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="typesafe-api-key">TypeSafe API Key</FieldLabel>
              <Input
                id="typesafe-api-key"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                required={value.enabled}
                disabled={saving}
                value={value.apiKey}
                onChange={(e) => setValue({ ...value, apiKey: e.target.value })}
              />
              <FieldDescription>{t(`${p}.keyHelp`)}</FieldDescription>
            </Field>
            <div className="grid gap-6 sm:grid-cols-2 sm:gap-x-4">
              <Field>
                <FieldLabel htmlFor="typesafe-model">{t("pages.admin.systemConfig.model")}</FieldLabel>
                <Input
                  id="typesafe-model"
                  spellCheck={false}
                  required
                  disabled={saving}
                  placeholder="jev-latest"
                  value={value.model}
                  onChange={(e) => setValue({ ...value, model: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="topic-check-threshold">{t(`${p}.threshold`)}</FieldLabel>
                <Input
                  id="topic-check-threshold"
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  max={1}
                  step={0.05}
                  required
                  disabled={saving}
                  value={value.threshold}
                  onChange={(e) => setValue({ ...value, threshold: e.target.valueAsNumber })}
                />
              </Field>
            </div>
            <FieldDescription>{t(`${p}.thresholdHelp`)}</FieldDescription>
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

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <Empty className="bg-muted shadow-(--sunken)">
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
                      {(v: string | null) => (v ? (providers.find((p) => p.id === v)?.name ?? v) : t("pages.admin.systemConfig.selectProvider"))}
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

export function EmbeddingSettings() {
  const { t } = useTranslation()
  const { value, setValue, failed, saving, load, save } = useSetting("embedding")
  const [providers, setProviders] = useState<AdminProvider[]>([])
  useEffect(() => {
    api<AdminProvider[]>("/admin/providers").then((list) => setProviders(list.filter((p) => p.isActive))).catch(() => {})
  }, [])
  if (failed) return <LoadFailed onRetry={load} />
  const p = "pages.admin.embedding"
  return (
    <PanelSection title={t(`${p}.title`)} description={t(`${p}.description`)}>
      {!value ? (
        <Skeleton className="h-48 w-full" />
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
              <FieldLabel>{t("pages.admin.systemConfig.provider")}</FieldLabel>
              <Select value={value.providerId || null} disabled={saving} onValueChange={(v) => setValue({ ...value, providerId: String(v ?? "") })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("pages.admin.systemConfig.selectProvider")}>
                    {(v: string | null) => (v ? (providers.find((provider) => provider.id === v)?.name ?? v) : t("pages.admin.systemConfig.selectProvider"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="embedding-model">{t(`${p}.modelId`)}</FieldLabel>
              <Input
                id="embedding-model"
                spellCheck={false}
                required={Boolean(value.providerId)}
                disabled={saving}
                placeholder={t(`${p}.modelPlaceholder`)}
                value={value.modelId}
                onChange={(e) => setValue({ ...value, modelId: e.target.value })}
              />
              <FieldDescription>{t(`${p}.modelHelp`)}</FieldDescription>
            </Field>
            <div className="mt-2 flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving && <Spinner data-icon="inline-start" />}
                {t("common.actions.save")}
              </Button>
              {(value.providerId || value.modelId) && (
                <Button type="button" variant="outline" disabled={saving} onClick={() => void save({ providerId: "", modelId: "" }, t(`${p}.turnedOff`))}>
                  {t(`${p}.off`)}
                </Button>
              )}
            </div>
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
