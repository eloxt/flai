import {
  MAX_MEMORY_POINT_LENGTH,
  MAX_MEMORY_POINTS,
  MAX_MEMORY_SUMMARY_LENGTH,
  MAX_MEMORY_TITLE_LENGTH,
  MEMORY_KINDS,
  type Memory,
  type MemoryContent,
  type MemoryEvent,
  type MemoryKind,
} from "@flai/shared"
import { Undo2Icon } from "lucide-react"
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
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import { Switch } from "~/components/ui/switch"
import { Table, TableBody, TableCell, TableRow } from "~/components/ui/table"
import { Textarea } from "~/components/ui/textarea"
import { api } from "~/lib/api"
import { formatDateTime } from "~/lib/format"
import { notify } from "~/lib/notify"
import { cn } from "cn"
import { usePreferences } from "~/store/auth-store"
import { useUpdatePreferences } from "./preference-settings"

const DAY_MS = 86_400_000

/** "5 days ago" within a week, otherwise a short date ("Jul 18", with the year when not this one). */
function useUpdatedLabel() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage
  return (iso: string) => {
    const date = new Date(iso)
    const days = Math.floor((Date.now() - date.getTime()) / DAY_MS)
    const when =
      days < 7
        ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
            -days,
            "day"
          )
        : date.toLocaleDateString(locale, {
            month: "short",
            day: "numeric",
            ...(date.getFullYear() !== new Date().getFullYear() && {
              year: "numeric",
            }),
          })
    return t("pages.settings.memory.updated", { when })
  }
}

interface Draft {
  kind: MemoryKind
  title: string
  summary: string
  points: string
}

const toDraft = (memory: Memory): Draft => ({
  kind: memory.kind,
  title: memory.title,
  summary: memory.summary,
  points: memory.points.join("\n"),
})

const draftPoints = (draft: Draft) =>
  draft.points
    .split("\n")
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean)

export function MemorySettings() {
  const { t } = useTranslation()
  const preferences = usePreferences()
  const updatePreferences = useUpdatePreferences()
  const updatedLabel = useUpdatedLabel()
  const [memories, setMemories] = useState<Memory[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
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

  const enabled = preferences.memory
  const open = memories?.find((m) => m.id === openId) ?? null

  const close = () => {
    setOpenId(null)
    setDraft(null)
  }

  const save = async () => {
    if (!open || !draft) return
    try {
      const updated = await api<Memory>(`/me/memories/${open.id}`, {
        method: "PATCH",
        body: {
          kind: draft.kind,
          title: draft.title,
          summary: draft.summary,
          points: draftPoints(draft),
        },
      })
      setMemories((list) =>
        (list ?? []).map((m) => (m.id === updated.id ? updated : m))
      )
      setDraft(null)
      void reload()
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

  const tooManyPoints = draft !== null && draftPoints(draft).length > MAX_MEMORY_POINTS
  const pointTooLong =
    draft !== null &&
    draftPoints(draft).some((p) => p.length > MAX_MEMORY_POINT_LENGTH)

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
            checked={enabled && preferences.memoryWrite}
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
        <div className="flex flex-col gap-6">
          {MEMORY_KINDS.map((kind) => {
            const topics = memories.filter((m) => m.kind === kind)
            if (topics.length === 0) return null
            return (
              <section key={kind} className="flex flex-col gap-2">
                <h4 className="text-sm font-medium">
                  {t(`pages.settings.memory.kinds.${kind}`)}
                </h4>
                <ul className="divide-y divide-border border-y border-border">
                  {topics.map((memory) => (
                    <li key={memory.id}>
                      <button
                        type="button"
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-0.5 py-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:px-1"
                        onClick={() => setOpenId(memory.id)}
                      >
                        <span className="truncate">{memory.title}</span>
                        <span className="col-span-2 row-start-2 truncate text-muted-foreground sm:col-span-1 sm:row-start-auto">
                          {memory.summary}
                        </span>
                        <span className="col-start-2 row-start-1 whitespace-nowrap text-muted-foreground tabular-nums sm:col-start-auto sm:row-start-auto">
                          {updatedLabel(memory.updatedAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
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
                      <div
                        className={cn(
                          "flex flex-col gap-1",
                          event.undoneAt && "line-through opacity-60"
                        )}
                      >
                        <ChangeText event={event} />
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

      <Dialog open={open !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-xl">
          {open && !draft && (
            <>
              <DialogHeader>
                <DialogTitle>{open.title}</DialogTitle>
              </DialogHeader>
              <dl className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto text-sm">
                <DetailItem label={t("pages.settings.memory.lastUpdated")}>
                  {new Date(open.updatedAt).toLocaleDateString(undefined, {
                    dateStyle: "medium",
                  })}
                </DetailItem>
                {open.summary && (
                  <DetailItem label={t("pages.settings.memory.summary")}>
                    {open.summary}
                  </DetailItem>
                )}
                <DetailItem label={t("pages.settings.memory.details")}>
                  <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-muted-foreground">
                    {open.points.map((point, i) => (
                      <li key={i} className="text-pretty">
                        {point}
                      </li>
                    ))}
                  </ul>
                </DetailItem>
              </dl>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleting(open)}>
                  {t("common.actions.delete")}
                </Button>
                <Button onClick={() => setDraft(toDraft(open))}>
                  {t("common.actions.edit")}
                </Button>
              </DialogFooter>
            </>
          )}
          {open && draft && (
            <>
              <DialogHeader>
                <DialogTitle>{t("pages.settings.memory.editTitle")}</DialogTitle>
              </DialogHeader>
              <FieldGroup>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                  <Field>
                    <FieldLabel htmlFor="memory-title">
                      {t("pages.settings.memory.name")}
                    </FieldLabel>
                    <Input
                      id="memory-title"
                      value={draft.title}
                      maxLength={MAX_MEMORY_TITLE_LENGTH}
                      onChange={(e) =>
                        setDraft({ ...draft, title: e.target.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{t("pages.settings.memory.kind")}</FieldLabel>
                    <Select
                      value={draft.kind}
                      onValueChange={(v) =>
                        setDraft({ ...draft, kind: v as MemoryKind })
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue>
                          {(v: MemoryKind) =>
                            t(`pages.settings.memory.kinds.${v}`)
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {MEMORY_KINDS.map((kind) => (
                            <SelectItem key={kind} value={kind}>
                              {t(`pages.settings.memory.kinds.${kind}`)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="memory-summary">
                    {t("pages.settings.memory.summary")}
                  </FieldLabel>
                  <Input
                    id="memory-summary"
                    value={draft.summary}
                    maxLength={MAX_MEMORY_SUMMARY_LENGTH}
                    onChange={(e) =>
                      setDraft({ ...draft, summary: e.target.value })
                    }
                  />
                </Field>
                <Field data-invalid={tooManyPoints || pointTooLong || undefined}>
                  <FieldLabel htmlFor="memory-points">
                    {t("pages.settings.memory.details")}
                  </FieldLabel>
                  <Textarea
                    id="memory-points"
                    className="max-h-[40vh] min-h-40"
                    value={draft.points}
                    aria-invalid={tooManyPoints || pointTooLong || undefined}
                    onChange={(e) =>
                      setDraft({ ...draft, points: e.target.value })
                    }
                  />
                  <FieldDescription>
                    {t("pages.settings.memory.detailsHint", {
                      max: MAX_MEMORY_POINTS,
                      length: MAX_MEMORY_POINT_LENGTH,
                    })}
                  </FieldDescription>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDraft(null)}>
                  {t("common.actions.cancel")}
                </Button>
                <Button
                  disabled={
                    !draft.title.trim() ||
                    draftPoints(draft).length === 0 ||
                    tooManyPoints ||
                    pointTooLong
                  }
                  onClick={save}
                >
                  {t("common.actions.save")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("common.dialog.confirmDelete")}
        description={deleting?.title}
        confirmLabel={t("common.actions.delete")}
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api(`/me/memories/${deleting.id}`, { method: "DELETE" })
            setMemories((list) =>
              (list ?? []).filter((m) => m.id !== deleting.id)
            )
            close()
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

function DetailItem({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Points in `b` that `a` doesn't have. */
const missing = (a: MemoryContent | null, b: MemoryContent | null) =>
  (b?.points ?? []).filter((p) => !(a?.points ?? []).includes(p))

/** One automatic change in words: which topic, and the points it added or removed. */
function ChangeText({ event }: { event: MemoryEvent }) {
  const { t } = useTranslation()
  const title = (event.after ?? event.before)!.title
  const added = event.action === "delete" ? [] : missing(event.before, event.after)
  const removed = event.action === "add" ? [] : missing(event.after, event.before)
  return (
    <>
      <span>{t(`pages.settings.memory.changes.${event.action}`, { title })}</span>
      {event.action === "update" && (added.length > 0 || removed.length > 0) && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {added.map((p, i) => (
            <li key={`a${i}`}>+ {p}</li>
          ))}
          {removed.map((p, i) => (
            <li key={`r${i}`}>− {p}</li>
          ))}
        </ul>
      )}
    </>
  )
}
