import type { Conversation, Page, User } from "@flai/shared"
import { MessagesSquareIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { ConfirmDialog } from "~/components/confirm-dialog"
import { PanelSection, PanelTable } from "~/components/panel-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Field, FieldContent, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet"
import { Skeleton } from "~/components/ui/skeleton"
import { Spinner } from "~/components/ui/spinner"
import { Switch } from "~/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table"
import { api } from "~/lib/api"
import { formatDateTime } from "~/lib/format"
import { notify } from "~/lib/notify"
import { useAuthStore } from "~/store/auth-store"

export function UserManagement() {
  const { t } = useTranslation()
  const me = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<User[] | null>(null)
  const [editing, setEditing] = useState<User | "new" | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)
  const [viewing, setViewing] = useState<User | null>(null)

  useEffect(() => {
    api<User[]>("/admin/users").then(setUsers).catch((e) => notify.error(e))
  }, [])

  const upsert = (user: User) =>
    setUsers((list) => (list?.some((u) => u.id === user.id) ? list.map((u) => (u.id === user.id ? user : u)) : [user, ...(list ?? [])]))

  const toggleActive = async (user: User, isActive: boolean) => {
    try {
      upsert(await api<User>(`/admin/users/${user.id}`, { method: "PATCH", body: { isActive } }))
    } catch (error) {
      notify.error(error)
    }
  }

  return (
    <PanelSection
      title={t("pages.admin.users.title")}
      description={t("pages.admin.users.description")}
      action={
        <Button onClick={() => setEditing("new")}>
          <PlusIcon data-icon="inline-start" />
          {t("pages.admin.users.create")}
        </Button>
      }
    >
      {users === null ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <PanelTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pages.admin.users.table.username")}</TableHead>
                <TableHead>{t("pages.admin.users.table.email")}</TableHead>
                <TableHead>{t("pages.admin.users.table.role")}</TableHead>
                <TableHead>{t("pages.admin.users.table.status")}</TableHead>
                <TableHead>{t("pages.admin.users.table.createdAt")}</TableHead>
                <TableHead className="text-right">{t("pages.admin.users.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role === "admin" ? t("pages.admin.users.roleAdmin") : t("pages.admin.users.roleUser")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={user.isActive}
                      disabled={user.id === me?.id}
                      aria-label={t("pages.admin.users.form.isActive")}
                      onCheckedChange={(v) => void toggleActive(user, v)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(user.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={t("pages.admin.users.conversations")} onClick={() => setViewing(user)}>
                        <MessagesSquareIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("common.edit")} onClick={() => setEditing(user)}>
                        <PencilIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("common.actions.delete")} disabled={user.id === me?.id} onClick={() => setDeleting(user)}>
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
      <UserDialog user={editing} onClose={() => setEditing(null)} onSaved={upsert} />
      <UserConversations user={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("pages.admin.users.deleteTitle")}
        description={t("pages.admin.users.deleteDescription")}
        confirmLabel={t("common.actions.delete")}
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api(`/admin/users/${deleting.id}`, { method: "DELETE" })
            setUsers((list) => (list ?? []).filter((u) => u.id !== deleting.id))
          } catch (error) {
            notify.error(error)
          }
        }}
      />
    </PanelSection>
  )
}

function UserDialog({ user, onClose, onSaved }: { user: User | "new" | null; onClose: () => void; onSaved: (user: User) => void }) {
  const { t } = useTranslation()
  const existing = user && user !== "new" ? user : null
  const [form, setForm] = useState({ email: "", username: "", password: "", role: "user" as User["role"], isActive: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      email: existing?.email ?? "",
      username: existing?.username ?? "",
      password: "",
      role: existing?.role ?? "user",
      isActive: existing?.isActive ?? true,
    })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { password, ...rest } = form
      const body = existing ? { ...rest, ...(password ? { password } : {}) } : form
      onSaved(await api<User>(existing ? `/admin/users/${existing.id}` : "/admin/users", { method: existing ? "PATCH" : "POST", body }))
      onClose()
    } catch (error) {
      notify.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{existing ? t("pages.admin.users.editTitle") : t("pages.admin.users.createTitle")}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="u-email">{t("pages.admin.users.form.email")}</FieldLabel>
              <Input id="u-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="u-name">{t("pages.admin.users.form.username")}</FieldLabel>
              <Input id="u-name" required minLength={5} maxLength={20} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="u-password">{t("pages.admin.users.form.password")}</FieldLabel>
              <Input
                id="u-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required={!existing}
                placeholder={existing ? t("pages.admin.users.form.passwordKeep") : undefined}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{t("pages.admin.users.form.role")}</FieldLabel>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as User["role"] })}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => (v === "admin" ? t("pages.admin.users.roleAdmin") : t("pages.admin.users.roleUser"))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="user">{t("pages.admin.users.roleUser")}</SelectItem>
                    <SelectItem value="admin">{t("pages.admin.users.roleAdmin")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="u-active">{t("pages.admin.users.form.isActive")}</FieldLabel>
              </FieldContent>
              <Switch id="u-active" checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
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

function UserConversations({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [items, setItems] = useState<Conversation[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async (next?: string | null) => {
    if (!user) return
    setLoading(true)
    try {
      const page = await api<Page<Conversation>>(`/admin/users/${user.id}/conversations`, { query: { cursor: next ?? undefined, limit: 30 } })
      setItems((list) => (next ? [...list, ...page.items] : page.items))
      setCursor(page.nextCursor)
    } catch (error) {
      notify.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setItems([])
    void load(null)
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("pages.admin.users.conversationsOf", { name: user?.username })}</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 pb-6">
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onClose()
                navigate(`/chat/${c.id}`)
              }}
            >
              <span>{c.icon}</span>
              <span className="flex-1 truncate">{c.title || t("components.sidebar.untitled")}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
            </button>
          ))}
          {!loading && items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("common.empty.noItems")}</p>}
          {cursor && (
            <Button variant="ghost" size="sm" disabled={loading} onClick={() => void load(cursor)}>
              {t("components.sidebar.loadMore")}
            </Button>
          )}
          {loading && <Spinner className="mx-auto" />}
        </div>
      </SheetContent>
    </Sheet>
  )
}
