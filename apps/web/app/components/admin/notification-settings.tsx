import type { Notification } from "@flai/shared"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ConfirmDialog } from "~/components/confirm-dialog"
import { PanelSection, PanelTable } from "~/components/panel-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Empty, EmptyHeader, EmptyTitle } from "~/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import { Spinner } from "~/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table"
import { Textarea } from "~/components/ui/textarea"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"

type Level = Notification["level"]

export function NotificationSettings() {
  const { t } = useTranslation()
  const [items, setItems] = useState<Notification[] | null>(null)
  const [editing, setEditing] = useState<Notification | "new" | null>(null)
  const [deleting, setDeleting] = useState<Notification | null>(null)

  useEffect(() => {
    api<Notification[]>("/admin/notifications").then(setItems).catch((e) => notify.error(e))
  }, [])

  const levelLabel = (level: Level) => (level === "warning" ? t("pages.admin.notification.levelWarning") : t("pages.admin.notification.levelDefault"))

  return (
    <PanelSection
      title={t("pages.admin.notification.title")}
      description={t("pages.admin.notification.description")}
      action={
        <Button onClick={() => setEditing("new")}>
          <PlusIcon data-icon="inline-start" />
          {t("pages.admin.notification.add")}
        </Button>
      }
    >
      {items === null ? (
        <Skeleton className="h-28 w-full" />
      ) : items.length === 0 ? (
        <Empty className="bg-muted shadow-(--sunken)">
          <EmptyHeader>
            <EmptyTitle>{t("common.empty.noItems")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <PanelTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pages.admin.notification.titleLabel")}</TableHead>
                <TableHead>{t("pages.admin.notification.contentLabel")}</TableHead>
                <TableHead>{t("pages.admin.notification.levelLabel")}</TableHead>
                <TableHead className="text-right">{t("common.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-medium">{n.title}</TableCell>
                  <TableCell className="max-w-72 truncate">{n.content}</TableCell>
                  <TableCell>
                    <Badge variant={n.level === "warning" ? "destructive" : "secondary"}>{levelLabel(n.level)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={t("common.edit")} onClick={() => setEditing(n)}>
                        <PencilIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("common.actions.delete")} onClick={() => setDeleting(n)}>
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
      <NotificationDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) =>
          setItems((list) => (list?.some((n) => n.id === saved.id) ? list.map((n) => (n.id === saved.id ? saved : n)) : [saved, ...(list ?? [])]))
        }
        levelLabel={levelLabel}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("pages.admin.notification.deleteTitle")}
        description={deleting?.title}
        confirmLabel={t("common.actions.delete")}
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api(`/admin/notifications/${deleting.id}`, { method: "DELETE" })
            setItems((list) => (list ?? []).filter((n) => n.id !== deleting.id))
          } catch (error) {
            notify.error(error)
          }
        }}
      />
    </PanelSection>
  )
}

function NotificationDialog({
  item,
  onClose,
  onSaved,
  levelLabel,
}: {
  item: Notification | "new" | null
  onClose: () => void
  onSaved: (n: Notification) => void
  levelLabel: (level: Level) => string
}) {
  const { t } = useTranslation()
  const existing = item && item !== "new" ? item : null
  const [form, setForm] = useState({ title: "", content: "", level: "default" as Level })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setForm({ title: existing?.title ?? "", content: existing?.content ?? "", level: existing?.level ?? "default" })
  }, [item]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      onSaved(
        await api<Notification>(existing ? `/admin/notifications/${existing.id}` : "/admin/notifications", {
          method: existing ? "PATCH" : "POST",
          body: form,
        })
      )
      onClose()
    } catch (error) {
      notify.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{existing ? t("pages.admin.notification.editTitle") : t("pages.admin.notification.addTitle")}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="n-title">{t("pages.admin.notification.titleLabel")}</FieldLabel>
              <Input id="n-title" required value={form.title} placeholder={t("pages.admin.notification.titlePlaceholder")} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="n-content">{t("pages.admin.notification.contentLabel")}</FieldLabel>
              <Textarea id="n-content" rows={4} value={form.content} placeholder={t("pages.admin.notification.contentPlaceholder")} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>{t("pages.admin.notification.levelLabel")}</FieldLabel>
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v as Level })}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: Level) => levelLabel(v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="default">{levelLabel("default")}</SelectItem>
                    <SelectItem value="warning">{levelLabel("warning")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {t("common.actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
