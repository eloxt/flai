import { MAX_MEMORY_LENGTH, type Memory, type MemoryEvent } from "@flai/shared"
import { PencilIcon, PinIcon, Trash2Icon, Undo2Icon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ConfirmDialog } from "~/components/confirm-dialog"
import { PanelSection, PanelTable } from "~/components/panel-dialog"
import { Badge } from "~/components/ui/badge"
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
import { cn } from "cn"
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
  const [events, setEvents] = useState<MemoryEvent[]>([])

  // Edits and deletes change which automatic changes can still be undone.
  const reload = useCallback(async () => {
    try {
      const [list, changes] = await Promise.all([
        api<Memory[]>("/me/memories"),
        api<MemoryEvent[]>("/me/memory-events"),
      ])
      setMemories(list)
      setEvents(changes)
    } catch (error) {
      notify.error(error)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

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
      void reload()
    } catch (error) {
      notify.error(error)
    }
  }

  const togglePin = async (memory: Memory) => {
    try {
      const updated = await api<Memory>(`/me/memories/${memory.id}`, {
        method: "PATCH",
        body: { pinned: !memory.pinned },
      })
      setMemories((list) =>
        (list ?? []).map((m) => (m.id === updated.id ? updated : m))
      )
    } catch (error) {
      notify.error(error)
    }
  }

  const undo = async (event: MemoryEvent) => {
    try {
      await api(`/me/memory-events/${event.id}/undo`, { method: "POST" })
      await reload()
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
                        aria-label={t("pages.settings.memory.pin")}
                        aria-pressed={memory.pinned}
                        title={t("pages.settings.memory.pinHint")}
                        onClick={() => void togglePin(memory)}
                      >
                        <PinIcon
                          className={cn(
                            memory.pinned
                              ? "fill-current"
                              : "text-muted-foreground"
                          )}
                        />
                      </Button>
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

      {events.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-medium">
              {t("pages.settings.memory.recentChanges")}
            </h4>
            <p className="text-sm text-muted-foreground">
              {t("pages.settings.memory.recentChangesDescription")}
            </p>
          </div>
          <PanelTable>
            <Table>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="min-w-56 break-words whitespace-normal">
                      <div className="flex flex-col gap-1">
                        <span
                          className={cn(
                            event.undoneAt && "line-through opacity-60"
                          )}
                        >
                          <ChangeText event={event} />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t(`pages.settings.memory.sources.${event.source}`)}
                          {event.note && ` · ${event.note}`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(event.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {event.undoneAt ? (
                          <Badge variant="secondary">
                            {t("pages.settings.memory.undone")}
                          </Badge>
                        ) : (
                          event.undoable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void undo(event)}
                            >
                              <Undo2Icon data-icon="inline-start" />
                              {t("pages.settings.memory.undo")}
                            </Button>
                          )
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelTable>
        </section>
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
            void reload()
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
            setEvents([])
          } catch (error) {
            notify.error(error)
          }
        }}
      />
    </PanelSection>
  )
}

/** One automatic change in words: what was added, changed or removed. */
function ChangeText({ event }: { event: MemoryEvent }) {
  const { t } = useTranslation()
  return t(`pages.settings.memory.changes.${event.action}`, {
    before: event.before,
    after: event.after,
  })
}
