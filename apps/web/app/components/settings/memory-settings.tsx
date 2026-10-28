import { MAX_MEMORY_LENGTH, type Memory } from "@flai/shared"
import { PencilIcon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ConfirmDialog } from "~/components/confirm-dialog"
import { PanelSection, PanelTable } from "~/components/panel-dialog"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Skeleton } from "~/components/ui/skeleton"
import { Switch } from "~/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { Textarea } from "~/components/ui/textarea"
import { api } from "~/lib/api"
import { formatDateTime } from "~/lib/format"
import { notify } from "~/lib/notify"
import { useAuthStore } from "~/store/auth-store"
import { useUpdatePreferences } from "./preference-settings"

export function MemorySettings() {
  const { t } = useTranslation()
  const preferences = useAuthStore((s) => s.user?.preferences)
  const updatePreferences = useUpdatePreferences()
  const [memories, setMemories] = useState<Memory[] | null>(null)
  const [editing, setEditing] = useState<Memory | null>(null)
  const [draft, setDraft] = useState("")
  const [deleting, setDeleting] = useState<Memory | null>(null)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    api<Memory[]>("/me/memories")
      .then(setMemories)
      .catch((e) => notify.error(e))
  }, [])

  const enabled = preferences?.memory ?? true

  const save = async () => {
    if (!editing) return
    try {
      const updated = await api<Memory>(`/me/memories/${editing.id}`, {
        method: "PATCH",
        body: { content: draft },
      })
      setMemories((list) =>
        (list ?? []).map((m) => (m.id === updated.id ? updated : m))
      )
      setEditing(null)
    } catch (error) {
      notify.error(error)
    }
  }

  return (
    <PanelSection
      title={t("pages.settings.memory.title")}
      description={t("pages.settings.memory.description")}
      action={
        <Button
          variant="outline"
          disabled={!memories?.length}
          onClick={() => setClearing(true)}
        >
          {t("pages.settings.memory.clearAll")}
        </Button>
      }
    >
      <FieldGroup className="gap-0 divide-y rounded-lg border border-border bg-card px-4 shadow-(--highlight)">
        <Field orientation="horizontal" className="items-center py-4">
          <FieldContent>
            <FieldLabel htmlFor="pref-memory">
              {t("pages.settings.memory.use")}
            </FieldLabel>
            <FieldDescription>
              {t("pages.settings.memory.useDescription")}
            </FieldDescription>
          </FieldContent>
          <Switch
            id="pref-memory"
            checked={enabled}
            onCheckedChange={(checked) =>
              void updatePreferences({ memory: checked })
            }
          />
        </Field>
        <Field
          orientation="horizontal"
          className="items-center py-4"
          data-disabled={!enabled || undefined}
        >
          <FieldContent>
            <FieldLabel htmlFor="pref-memory-write">
              {t("pages.settings.memory.write")}
            </FieldLabel>
            <FieldDescription>
              {t("pages.settings.memory.writeDescription")}
            </FieldDescription>
          </FieldContent>
          <Switch
            id="pref-memory-write"
            disabled={!enabled}
            checked={enabled && (preferences?.memoryWrite ?? true)}
            onCheckedChange={(checked) =>
              void updatePreferences({ memoryWrite: checked })
            }
          />
        </Field>
      </FieldGroup>

      {memories === null ? (
        <Skeleton className="h-28 w-full" />
      ) : memories.length === 0 ? (
        <Empty className="bg-muted shadow-(--sunken)">
          <EmptyHeader>
            <EmptyTitle>{t("pages.settings.memory.empty")}</EmptyTitle>
            <EmptyDescription>
              {t("pages.settings.memory.emptyHint")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <PanelTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pages.settings.memory.content")}</TableHead>
                <TableHead>{t("pages.settings.memory.updatedAt")}</TableHead>
                <TableHead className="text-right">
                  {t("common.table.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memories.map((memory) => (
                <TableRow key={memory.id}>
                  <TableCell className="min-w-56 break-words whitespace-normal">
                    {memory.content}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(memory.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("pages.settings.memory.editTitle")}
                        onClick={() => {
                          setDraft(memory.content)
                          setEditing(memory)
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("common.actions.delete")}
                        onClick={() => setDeleting(memory)}
                      >
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

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pages.settings.memory.editTitle")}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={draft}
            maxLength={MAX_MEMORY_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
          />
          <DialogFooter>
            <Button disabled={!draft.trim()} onClick={save}>
              {t("common.actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("common.dialog.confirmDelete")}
        description={deleting?.content}
        confirmLabel={t("common.actions.delete")}
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api(`/me/memories/${deleting.id}`, { method: "DELETE" })
            setMemories((list) =>
              (list ?? []).filter((m) => m.id !== deleting.id)
            )
          } catch (error) {
            notify.error(error)
          }
        }}
      />

      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title={t("pages.settings.memory.confirmClear")}
        description={t("pages.settings.memory.confirmClearDescription")}
        confirmLabel={t("pages.settings.memory.clearAll")}
        destructive
        onConfirm={async () => {
          try {
            await api("/me/memories", { method: "DELETE" })
            setMemories([])
          } catch (error) {
            notify.error(error)
          }
        }}
      />
    </PanelSection>
  )
}
