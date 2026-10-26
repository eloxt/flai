import type { McpServer } from "@flai/shared"
import { PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ConfirmDialog } from "~/components/confirm-dialog"
import { PanelSection } from "~/components/panel-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"
import { Spinner } from "~/components/ui/spinner"
import { Switch } from "~/components/ui/switch"
import { Textarea } from "~/components/ui/textarea"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"

export function McpSettings() {
  const { t } = useTranslation()
  const [servers, setServers] = useState<McpServer[] | null>(null)
  const [editing, setEditing] = useState<McpServer | "new" | null>(null)
  const [deleting, setDeleting] = useState<McpServer | null>(null)
  const [refreshing, setRefreshing] = useState<string | null>(null)

  const load = () => api<McpServer[]>("/mcp-servers").then(setServers).catch((e) => notify.error(e))
  useEffect(() => {
    void load()
  }, [])

  const replace = (server: McpServer) => setServers((list) => (list ?? []).map((s) => (s.id === server.id ? server : s)))

  const refresh = async (server: McpServer) => {
    setRefreshing(server.id)
    try {
      replace(await api<McpServer>(`/mcp-servers/${server.id}/refresh`, { method: "POST" }))
      notify.success(t("pages.settings.mcp.refreshSuccess"))
    } catch (error) {
      notify.error(error)
    } finally {
      setRefreshing(null)
    }
  }

  const toggle = async (server: McpServer, isActive: boolean) => {
    try {
      replace(await api<McpServer>(`/mcp-servers/${server.id}`, { method: "PATCH", body: { isActive } }))
    } catch (error) {
      notify.error(error)
    }
  }

  return (
    <PanelSection
      title={t("pages.settings.mcp.title")}
      description={t("pages.settings.mcp.description")}
      action={
        <Button onClick={() => setEditing("new")}>
          <PlusIcon data-icon="inline-start" />
          {t("pages.settings.mcp.add")}
        </Button>
      }
    >
      {servers === null ? (
        <Skeleton className="h-28 w-full" />
      ) : servers.length === 0 ? (
        <Empty className="bg-muted shadow-(--sunken)">
          <EmptyHeader>
            <EmptyTitle>{t("common.empty.noItems")}</EmptyTitle>
            <EmptyDescription>{t("pages.settings.mcp.emptyHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {servers.map((server) => (
            <Card key={server.id} size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {server.name}
                  <Badge variant={server.isActive ? "secondary" : "outline"}>
                    {server.isActive ? t("common.status.active") : t("common.status.inactive")}
                  </Badge>
                </CardTitle>
                <CardDescription className="truncate font-mono text-xs">{server.url}</CardDescription>
                <CardAction className="flex items-center gap-1">
                  <Switch checked={server.isActive} aria-label={t("pages.settings.mcp.activate")} onCheckedChange={(v) => void toggle(server, v)} />
                  <Button variant="ghost" size="icon-sm" aria-label={t("pages.settings.mcp.refreshTools")} disabled={refreshing === server.id} onClick={() => void refresh(server)}>
                    {refreshing === server.id ? <Spinner /> : <RefreshCwIcon />}
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={t("common.edit")} onClick={() => setEditing(server)}>
                    <PencilIcon />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={t("common.actions.delete")} onClick={() => setDeleting(server)}>
                    <Trash2Icon />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {server.tools.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("pages.settings.mcp.noTools")}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {server.tools.map((tool) => (
                      <Badge key={tool.name} variant="outline" title={tool.description}>
                        {tool.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <McpServerDialog
        server={editing}
        onClose={() => setEditing(null)}
        onSaved={(server, created) => {
          setServers((list) => (created ? [server, ...(list ?? [])] : (list ?? []).map((s) => (s.id === server.id ? server : s))))
          if (created) void refresh(server)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("pages.settings.mcp.confirmDelete")}
        description={deleting?.name}
        confirmLabel={t("common.actions.delete")}
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api(`/mcp-servers/${deleting.id}`, { method: "DELETE" })
            setServers((list) => (list ?? []).filter((s) => s.id !== deleting.id))
          } catch (error) {
            notify.error(error)
          }
        }}
      />
    </PanelSection>
  )
}

function McpServerDialog({
  server,
  onClose,
  onSaved,
}: {
  server: McpServer | "new" | null
  onClose: () => void
  onSaved: (server: McpServer, created: boolean) => void
}) {
  const { t } = useTranslation()
  const existing = server && server !== "new" ? server : null
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [headers, setHeaders] = useState("")
  const [headersError, setHeadersError] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(existing?.name ?? "")
    setUrl(existing?.url ?? "")
    setHeaders(existing && Object.keys(existing.headers).length ? JSON.stringify(existing.headers, null, 2) : "")
    setHeadersError(false)
  }, [server]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    let parsed: Record<string, string> = {}
    try {
      parsed = headers.trim() ? JSON.parse(headers) : {}
      if (typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((v) => typeof v !== "string")) throw new Error()
    } catch {
      setHeadersError(true)
      return
    }
    setSaving(true)
    try {
      const body = { name, url, headers: parsed }
      const saved = existing
        ? await api<McpServer>(`/mcp-servers/${existing.id}`, { method: "PATCH", body })
        : await api<McpServer>("/mcp-servers", { method: "POST", body })
      onSaved(saved, !existing)
      onClose()
    } catch (error) {
      notify.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={server !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{existing ? t("pages.settings.mcp.editTitle") : t("pages.settings.mcp.addTitle")}</DialogTitle>
            <DialogDescription>{t("pages.settings.mcp.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="mcp-name">{t("pages.settings.mcp.name")}</FieldLabel>
              <Input id="mcp-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("pages.settings.mcp.namePlaceholder")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="mcp-url">{t("pages.settings.mcp.endpoint")}</FieldLabel>
              <Input id="mcp-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("pages.settings.mcp.endpointPlaceholder")} />
              <FieldDescription>{t("pages.settings.mcp.httpOnly")}</FieldDescription>
            </Field>
            <Field data-invalid={headersError || undefined}>
              <FieldLabel htmlFor="mcp-headers">{t("pages.settings.mcp.headers")}</FieldLabel>
              <Textarea
                id="mcp-headers"
                rows={4}
                className="font-mono text-xs"
                aria-invalid={headersError || undefined}
                value={headers}
                onChange={(e) => {
                  setHeaders(e.target.value)
                  setHeadersError(false)
                }}
                placeholder={t("pages.settings.mcp.headersPlaceholder")}
              />
              {headersError && <FieldError>{t("pages.settings.mcp.invalidHeaders")}</FieldError>}
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
