import { type AdminProvider, PROVIDER_TYPES, type ProviderInput, type ProviderType } from "@flai/shared"
import { ArrowDownIcon, ArrowUpIcon, FileJsonIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ConfirmDialog } from "~/components/confirm-dialog"
import { PanelList, PanelSection, PanelTable } from "~/components/panel-dialog"
import { ProviderLogo } from "~/components/provider-logo"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Spinner } from "~/components/ui/spinner"
import { Switch } from "~/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table"
import { Textarea } from "~/components/ui/textarea"
import { useResourceList } from "~/hooks/use-resource-list"
import { api } from "~/lib/api"
import { extractModels } from "~/lib/model-import"
import { notify } from "~/lib/notify"
import { useModelStore } from "~/store/model-store"
import { ModelListEditor } from "./model-editor"

const TYPE_LABELS: Record<ProviderType, string> = {
  openai: "OpenAI (Responses)",
  openai_completion: "OpenAI Compatible (Chat Completions)",
  gemini: "Google Gemini",
}

export function ProviderManagement() {
  const { t } = useTranslation()
  const { items: providers, failed, reload, upsert, remove, setItems: setProviders } = useResourceList<AdminProvider>("/admin/providers", { addAt: "end" })
  const [editing, setEditing] = useState<AdminProvider | "new" | null>(null)
  const [deleting, setDeleting] = useState<AdminProvider | null>(null)
  const [reordering, setReordering] = useState(false)

  const changed = () => void useModelStore.getState().load().catch(() => {})

  const move = async (index: number, delta: -1 | 1) => {
    if (!providers || reordering || index + delta < 0 || index + delta >= providers.length) return
    const next = [...providers]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item!)
    setReordering(true)
    try {
      await api("/admin/providers/order", { method: "PUT", body: { ids: next.map((p) => p.id) } })
      setProviders(next)
      changed()
    } catch (error) {
      notify.error(error)
    } finally {
      setReordering(false)
    }
  }

  return (
    <PanelSection
      title={t("pages.admin.providers.title")}
      description={t("pages.admin.providers.description")}
      action={
        <Button disabled={reordering} onClick={() => setEditing("new")}>
          <PlusIcon data-icon="inline-start" />
          {t("pages.admin.providers.create")}
        </Button>
      }
    >
      <PanelList items={providers} failed={failed} onRetry={reload} tall>
        {(providers) => (
          <PanelTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("pages.admin.providers.table.order")}</TableHead>
                  <TableHead>{t("pages.admin.providers.table.name")}</TableHead>
                  <TableHead>{t("pages.admin.providers.table.providerType")}</TableHead>
                  <TableHead>{t("pages.admin.providers.table.apiKey")}</TableHead>
                  <TableHead>{t("pages.admin.providers.table.status")}</TableHead>
                  <TableHead className="text-right">{t("pages.admin.providers.table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody aria-busy={reordering}>
                {providers.map((p, index) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={t("pages.admin.providers.moveUp", { name: p.name })} disabled={reordering || index === 0} onClick={() => move(index, -1)}>
                          <ArrowUpIcon />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={t("pages.admin.providers.moveDown", { name: p.name })} disabled={reordering || index === providers.length - 1} onClick={() => move(index, 1)}>
                          <ArrowDownIcon />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <ProviderLogo logo={p.logo} name={p.name} />
                        {p.name}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{TYPE_LABELS[p.type] ?? p.type}</TableCell>
                    <TableCell className="font-mono text-xs">{p.apiKey}</TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? "secondary" : "outline"}>{p.isActive ? t("common.status.active") : t("common.status.inactive")}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={t("common.edit")} disabled={reordering} onClick={() => setEditing(p)}>
                          <PencilIcon />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={t("common.actions.delete")} disabled={reordering} onClick={() => setDeleting(p)}>
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelTable>
        )}
      </PanelList>
      <ProviderDialog
        provider={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          upsert(saved)
          changed()
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("pages.admin.providers.deleteTitle")}
        description={t("pages.admin.providers.deleteDescription")}
        confirmLabel={t("common.actions.delete")}
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api(`/admin/providers/${deleting.id}`, { method: "DELETE" })
            remove(deleting.id)
            changed()
          } catch (error) {
            notify.error(error)
          }
        }}
      />
    </PanelSection>
  )
}

const blankForm = (): ProviderInput => ({ name: "", type: "openai", apiKey: "", baseUrl: "", logo: "", isActive: true, models: [] })

function ProviderDialog({
  provider,
  onClose,
  onSaved,
}: {
  provider: AdminProvider | "new" | null
  onClose: () => void
  onSaved: (provider: AdminProvider) => void
}) {
  const { t } = useTranslation()
  const existing = provider && provider !== "new" ? provider : null
  const [form, setForm] = useState<ProviderInput>(blankForm)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const f = "pages.admin.providers.form"

  useEffect(() => {
    setForm(
      existing
        ? {
            name: existing.name,
            type: existing.type,
            apiKey: existing.apiKey,
            baseUrl: existing.baseUrl ?? "",
            logo: existing.logo ?? "",
            isActive: existing.isActive,
            models: existing.models,
          }
        : blankForm()
    )
  }, [provider]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (form.models.some((m) => !m.id.trim())) return notify.error(t("pages.admin.providers.model.idRequired"))
    setSaving(true)
    try {
      const body = { ...form, baseUrl: form.baseUrl?.trim() || null, logo: form.logo?.trim() || null }
      const saved = await api<AdminProvider>(existing ? `/admin/providers/${existing.id}` : "/admin/providers", {
        method: existing ? "PATCH" : "POST",
        body,
      })
      onSaved(saved)
      notify.success(existing ? t("common.crud.updateSuccess") : t("common.crud.createSuccess"))
      onClose()
    } catch (error) {
      notify.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={provider !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{existing ? t("pages.admin.providers.editTitle") : t("pages.admin.providers.createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
            <FieldGroup>
              <div className="grid gap-6 sm:grid-cols-2 sm:gap-x-4">
                <Field>
                  <FieldLabel htmlFor="p-name">{t(`${f}.name`)}</FieldLabel>
                  <Input id="p-name" required value={form.name} placeholder={t(`${f}.namePlaceholder`)} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>{t(`${f}.providerType`)}</FieldLabel>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ProviderType })}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: ProviderType) => TYPE_LABELS[v]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {PROVIDER_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="p-key">{t(`${f}.apiKey`)}</FieldLabel>
                  <Input
                    id="p-key"
                    required
                    autoComplete="off"
                    value={form.apiKey}
                    placeholder={existing ? t(`${f}.apiKeyPlaceholderOptional`) : t(`${f}.apiKeyPlaceholder`)}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="p-url">{t(`${f}.baseUrl`)}</FieldLabel>
                  <Input id="p-url" type="url" value={form.baseUrl ?? ""} placeholder={t(`${f}.baseUrlPlaceholder`)} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="p-logo">{t(`${f}.logo`)}</FieldLabel>
                <div className="flex items-center gap-4">
                  <Textarea id="p-logo" rows={1} className="field-sizing-fixed h-8 min-h-8 resize-none overflow-y-auto py-1 font-mono text-xs" value={form.logo ?? ""} placeholder={t(`${f}.logoPlaceholder`)} onChange={(e) => setForm({ ...form, logo: e.target.value })} />
                  <ProviderLogo logo={form.logo || null} name={form.name} className="size-8" />
                </div>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="p-active">{t(`${f}.isActive`)}</FieldLabel>
                </FieldContent>
                <Switch id="p-active" checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </Field>
              <Field className="border-t pt-6">
                <div className="flex items-center justify-between gap-4">
                  <FieldLabel>{t(`${f}.models`)}</FieldLabel>
                  <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                    <FileJsonIcon data-icon="inline-start" />
                    {t(`${f}.importJson`)}
                  </Button>
                </div>
                <ModelListEditor models={form.models} onChange={(models) => setForm({ ...form, models })} />
              </Field>
            </FieldGroup>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {t("common.actions.save")}
            </Button>
          </DialogFooter>
        </form>
        <ImportModelsDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImport={(models) => {
            const known = new Set(form.models.map((m) => m.id))
            setForm({ ...form, models: [...form.models, ...models.filter((m) => !known.has(m.id))] })
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function ImportModelsDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (models: ReturnType<typeof extractModels>) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const f = "pages.admin.providers.form"
  const apply = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return notify.error(t(`${f}.importJsonInvalid`))
    }
    const models = extractModels(parsed)
    if (models.length === 0) return notify.error(t(`${f}.importJsonNoModels`))
    onImport(models)
    setText("")
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(`${f}.importJsonTitle`)}</DialogTitle>
          <DialogDescription>{t(`${f}.importJsonDescription`)}</DialogDescription>
        </DialogHeader>
        <Field>
          <Textarea rows={12} className="field-sizing-fixed h-64 resize-none overflow-y-auto font-mono text-xs" value={text} placeholder={t(`${f}.importJsonPlaceholder`)} onChange={(e) => setText(e.target.value)} />
          <FieldDescription>{t(`${f}.importJsonHint`)}</FieldDescription>
        </Field>
        <DialogFooter>
          <Button onClick={apply}>{t(`${f}.importJsonApply`)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
