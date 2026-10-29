import type { AdminProvider, SettingKey, SettingValue } from "@flai/shared"
import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { LoadFailed, PanelSection } from "~/components/panel-dialog"
import { Button } from "~/components/ui/button"
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

/** What a setting's fields get to work with once it has loaded. */
interface SettingForm<K extends SettingKey> {
  value: SettingValue<K>
  update: (patch: Partial<SettingValue<K>>) => void
  saving: boolean
  save: (next: SettingValue<K>, success: string) => Promise<boolean>
}

/** One setting as a panel: loading and failure states, the form, and its save button. */
function SettingPanel<K extends SettingKey>({
  settingKey,
  title,
  description,
  skeleton = "h-48",
  narrow = false,
  onSaved,
  actions,
  children,
}: {
  settingKey: K
  title: string
  description: string
  /** Height class of the placeholder shown while loading. */
  skeleton?: string
  narrow?: boolean
  onSaved?: () => void | Promise<void>
  /** Buttons after Save. */
  actions?: (form: SettingForm<K>) => ReactNode
  children: (form: SettingForm<K>) => ReactNode
}) {
  const { t } = useTranslation()
  const { value, setValue, failed, saving, load, save } = useSetting(settingKey)
  if (failed) return <LoadFailed onRetry={load} />
  const form = value && {
    value,
    update: (patch: Partial<SettingValue<K>>) => setValue({ ...value, ...patch }),
    saving,
    save,
  }
  return (
    <PanelSection title={title} description={description}>
      {!form ? (
        <Skeleton className={`${skeleton} w-full`} />
      ) : (
        <form
          className={narrow ? "max-w-xl" : undefined}
          onSubmit={async (e: FormEvent) => {
            e.preventDefault()
            if (await save(form.value, t("pages.admin.systemConfig.saved"))) await onSaved?.()
          }}
        >
          <FieldGroup>
            {children(form)}
            <div className="mt-2 flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving && <Spinner data-icon="inline-start" />}
                {t("common.actions.save")}
              </Button>
              {actions?.(form)}
            </div>
          </FieldGroup>
        </form>
      )}
    </PanelSection>
  )
}

/** Active providers, for model pickers. */
function useActiveProviders() {
  const [providers, setProviders] = useState<AdminProvider[]>([])
  useEffect(() => {
    api<AdminProvider[]>("/admin/providers").then((list) => setProviders(list.filter((p) => p.isActive))).catch(() => {})
  }, [])
  return providers
}

function ProviderSelect({
  providers,
  value,
  disabled,
  onChange,
}: {
  providers: AdminProvider[]
  value: string
  disabled?: boolean
  onChange: (providerId: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Field>
      <FieldLabel>{t("pages.admin.systemConfig.provider")}</FieldLabel>
      <Select value={value || null} disabled={disabled} onValueChange={(v) => onChange(String(v ?? ""))}>
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
  )
}

interface ProviderModel {
  providerId: string
  modelId: string
}

/** Provider and model pickers over the active providers. */
function ProviderModelSelects({ value, onChange }: { value: ProviderModel; onChange: (patch: Partial<ProviderModel>) => void }) {
  const { t } = useTranslation()
  const providers = useActiveProviders()
  const provider = providers.find((p) => p.id === value.providerId)
  return (
    <div className="grid gap-6 sm:grid-cols-2 sm:gap-x-4">
      <ProviderSelect providers={providers} value={value.providerId} onChange={(providerId) => onChange({ providerId, modelId: "" })} />
      <Field>
        <FieldLabel>{t("pages.admin.systemConfig.model")}</FieldLabel>
        <Select value={value.modelId || null} disabled={!provider} onValueChange={(v) => onChange({ modelId: String(v ?? "") })}>
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
  )
}

export function WebSearchSettings() {
  const { t } = useTranslation()
  const p = "pages.admin.webSearch"
  return (
    <SettingPanel
      settingKey="web_search"
      title={t(`${p}.title`)}
      description={t(`${p}.description`)}
      narrow
      // Exa mode changes which search toggles models offer.
      onSaved={async () => {
        await useModelStore.getState().load().catch(notify.error)
      }}
    >
      {({ value, update, saving }) => (
        <>
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
                if (provider === "native" || provider === "exa") update({ provider })
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
              onChange={(e) => update({ exaApiKey: e.target.value })}
            />
            <FieldDescription>{t(`${p}.keyHelp`)}</FieldDescription>
          </Field>
        </>
      )}
    </SettingPanel>
  )
}

export function TopicCheckSettings() {
  const { t } = useTranslation()
  const p = "pages.admin.topicCheck"
  return (
    <SettingPanel settingKey="topic_check" title={t(`${p}.title`)} description={t(`${p}.description`)} skeleton="h-60" narrow>
      {({ value, update, saving }) => (
        <>
          <Field orientation="horizontal" className="items-center">
            <FieldContent>
              <FieldLabel htmlFor="topic-check-enabled">{t(`${p}.enabled`)}</FieldLabel>
            </FieldContent>
            <Switch
              id="topic-check-enabled"
              checked={value.enabled}
              disabled={saving}
              onCheckedChange={(enabled) => update({ enabled })}
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
              onChange={(e) => update({ baseUrl: e.target.value })}
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
              onChange={(e) => update({ apiKey: e.target.value })}
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
                onChange={(e) => update({ model: e.target.value })}
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
                onChange={(e) => update({ threshold: e.target.valueAsNumber })}
              />
            </Field>
          </div>
          <FieldDescription>{t(`${p}.thresholdHelp`)}</FieldDescription>
        </>
      )}
    </SettingPanel>
  )
}

export function SystemPromptSettings() {
  const { t } = useTranslation()
  return (
    <SettingPanel
      settingKey="system_prompt"
      title={t("pages.admin.systemConfig.systemPrompt")}
      description={t("pages.admin.systemConfig.systemPromptHelp")}
      skeleton="h-60"
    >
      {({ value, update }) => (
        <>
          <Field>
            <FieldLabel htmlFor="sp-chat">{t("pages.admin.systemConfig.chatPrompt")}</FieldLabel>
            <Textarea id="sp-chat" rows={10} value={value.chat} onChange={(e) => update({ chat: e.target.value })} />
            <FieldDescription>{t("pages.admin.systemConfig.chatPromptHelp")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="sp-translate">{t("pages.admin.systemConfig.translatePrompt")}</FieldLabel>
            <Textarea id="sp-translate" rows={6} value={value.translate} onChange={(e) => update({ translate: e.target.value })} />
            <FieldDescription>{t("pages.admin.systemConfig.translatePromptHelp")}</FieldDescription>
          </Field>
        </>
      )}
    </SettingPanel>
  )
}

export function TitleGenerationSettings() {
  const { t } = useTranslation()
  return (
    <SettingPanel
      settingKey="title_generation"
      title={t("pages.admin.systemConfig.titleGeneration")}
      description={t("pages.admin.systemConfig.titleHelp")}
    >
      {({ value, update }) => (
        <>
          <ProviderModelSelects value={value} onChange={update} />
          <Field>
            <FieldLabel htmlFor="tg-prompt">{t("pages.admin.systemConfig.titlePrompt")}</FieldLabel>
            <Textarea id="tg-prompt" rows={6} value={value.prompt} onChange={(e) => update({ prompt: e.target.value })} />
          </Field>
        </>
      )}
    </SettingPanel>
  )
}

export function BackgroundModelSettings() {
  const { t } = useTranslation()
  return (
    <SettingPanel
      settingKey="background_model"
      title={t("pages.admin.backgroundModel.title")}
      description={t("pages.admin.backgroundModel.description")}
      skeleton="h-28"
      actions={({ value, saving, save }) =>
        (value.providerId || value.modelId) && (
          <Button type="button" variant="ghost" disabled={saving} onClick={() => void save({ providerId: "", modelId: "" }, t("pages.admin.systemConfig.saved"))}>
            {t("pages.admin.backgroundModel.useTitleModel")}
          </Button>
        )
      }
    >
      {({ value, update }) => <ProviderModelSelects value={value} onChange={update} />}
    </SettingPanel>
  )
}

export function EmbeddingSettings() {
  const { t } = useTranslation()
  const providers = useActiveProviders()
  const p = "pages.admin.embedding"
  return (
    <SettingPanel
      settingKey="embedding"
      title={t(`${p}.title`)}
      description={t(`${p}.description`)}
      narrow
      actions={({ value, saving, save }) =>
        (value.providerId || value.modelId) && (
          <Button type="button" variant="outline" disabled={saving} onClick={() => void save({ providerId: "", modelId: "" }, t(`${p}.turnedOff`))}>
            {t(`${p}.off`)}
          </Button>
        )
      }
    >
      {({ value, update, saving }) => (
        <>
          <ProviderSelect providers={providers} value={value.providerId} disabled={saving} onChange={(providerId) => update({ providerId })} />
          <Field>
            <FieldLabel htmlFor="embedding-model">{t(`${p}.modelId`)}</FieldLabel>
            <Input
              id="embedding-model"
              spellCheck={false}
              required={Boolean(value.providerId)}
              disabled={saving}
              placeholder={t(`${p}.modelPlaceholder`)}
              value={value.modelId}
              onChange={(e) => update({ modelId: e.target.value })}
            />
            <FieldDescription>{t(`${p}.modelHelp`)}</FieldDescription>
          </Field>
        </>
      )}
    </SettingPanel>
  )
}

export function ErrorAlertSettings() {
  const { t } = useTranslation()
  return (
    <SettingPanel
      settingKey="error_alert"
      title={t("pages.admin.errorAlert.title")}
      description={t("pages.admin.errorAlert.description")}
      skeleton="h-24"
      narrow
    >
      {({ value, update }) => (
        <Field>
          <FieldLabel htmlFor="bark-url">{t("pages.admin.errorAlert.urlLabel")}</FieldLabel>
          <Input id="bark-url" type="url" value={value.barkUrl} placeholder={t("pages.admin.errorAlert.placeholder")} onChange={(e) => update({ barkUrl: e.target.value })} />
          <FieldDescription>{t("pages.admin.errorAlert.help")}</FieldDescription>
        </Field>
      )}
    </SettingPanel>
  )
}
