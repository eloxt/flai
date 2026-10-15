import type { Share } from "@flai/shared"
import { CopyIcon, ExternalLinkIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ConfirmDialog } from "~/components/confirm-dialog"
import { PanelSection } from "~/components/panel-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Empty, EmptyHeader, EmptyTitle } from "~/components/ui/empty"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table"
import { api } from "~/lib/api"
import { formatDateTime } from "~/lib/format"
import { notify } from "~/lib/notify"
import { EXPIRY_LABELS, EXPIRY_OPTIONS, type ExpiryOption, expiryFrom, shareUrl } from "~/lib/share"

export function ShareSettings() {
  const { t } = useTranslation()
  const [shares, setShares] = useState<Share[] | null>(null)
  const [editing, setEditing] = useState<Share | null>(null)
  const [deleting, setDeleting] = useState<Share | null>(null)
  const [expiry, setExpiry] = useState<ExpiryOption>("7d")

  useEffect(() => {
    api<Share[]>("/shares").then(setShares).catch((e) => notify.error(e))
  }, [])

  const expired = (s: Share) => s.expiresAt !== null && new Date(s.expiresAt).getTime() <= Date.now()

  const saveExpiry = async () => {
    if (!editing) return
    try {
      const updated = await api<Share>(`/shares/${editing.id}`, { method: "PATCH", body: { expiresAt: expiryFrom(expiry) } })
      setShares((list) => (list ?? []).map((s) => (s.id === updated.id ? updated : s)))
      setEditing(null)
      notify.success(t("common.crud.updateSuccess"))
    } catch (error) {
      notify.error(error)
    }
  }

  return (
    <PanelSection title={t("pages.settings.share.title")} description={t("pages.settings.share.description")}>
      {shares === null ? (
        <Skeleton className="h-28 w-full" />
      ) : shares.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t("common.empty.noItems")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pages.settings.share.conversation")}</TableHead>
                <TableHead>{t("pages.settings.share.createdAt")}</TableHead>
                <TableHead>{t("pages.settings.share.expiresAt")}</TableHead>
                <TableHead className="text-right">{t("common.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shares.map((share) => (
                <TableRow key={share.id}>
                  <TableCell className="max-w-56 truncate">
                    {share.icon} {share.title || t("pages.settings.share.untitled")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(share.createdAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {expired(share) ? (
                      <Badge variant="destructive">{t("pages.settings.share.expired")}</Badge>
                    ) : share.expiresAt ? (
                      formatDateTime(share.expiresAt)
                    ) : (
                      t("pages.settings.share.never")
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("pages.settings.share.copyLink")}
                        onClick={async () => {
                          await navigator.clipboard.writeText(shareUrl(share.id))
                          notify.success(t("pages.settings.share.copied"))
                        }}
                      >
                        <CopyIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("pages.settings.share.openLink")} render={<a href={shareUrl(share.id)} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
                        <ExternalLinkIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("pages.settings.share.editTitle")}
                        onClick={() => {
                          setExpiry("7d")
                          setEditing(share)
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("common.actions.delete")} onClick={() => setDeleting(share)}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("pages.settings.share.editTitle")}</DialogTitle>
            <DialogDescription>{t("pages.settings.share.editDescription")}</DialogDescription>
          </DialogHeader>
          <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryOption)}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v: ExpiryOption) => t(`components.share.expiration.${EXPIRY_LABELS[v]}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {EXPIRY_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {t(`components.share.expiration.${EXPIRY_LABELS[o]}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={saveExpiry}>{t("common.actions.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("common.dialog.confirmDelete")}
        description={deleting?.title}
        confirmLabel={t("common.actions.delete")}
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api(`/shares/${deleting.id}`, { method: "DELETE" })
            setShares((list) => (list ?? []).filter((s) => s.id !== deleting.id))
          } catch (error) {
            notify.error(error)
          }
        }}
      />
    </PanelSection>
  )
}
