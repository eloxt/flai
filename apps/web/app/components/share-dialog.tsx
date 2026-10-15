import type { Share } from "@flai/shared"
import { CheckIcon, CopyIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import { Spinner } from "~/components/ui/spinner"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"
import { EXPIRY_LABELS, EXPIRY_OPTIONS, type ExpiryOption, expiryFrom, shareUrl } from "~/lib/share"

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  /** Last message of the branch being shared. */
  leafMessageId: string | undefined
}

export function ShareDialog({ open, onOpenChange, conversationId, leafMessageId }: ShareDialogProps) {
  const { t } = useTranslation()
  const [expiry, setExpiry] = useState<ExpiryOption>("7d")
  const [existing, setExisting] = useState<Share | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !conversationId) return
    let active = true
    setChecking(true)
    setExisting(null)
    setExpiry("7d")
    api<Share | null>(`/conversations/${conversationId}/share`)
      .then((share) => active && setExisting(share))
      .catch(() => {})
      .finally(() => active && setChecking(false))
    return () => {
      active = false
    }
  }, [open, conversationId])

  const save = async () => {
    if (!leafMessageId) return
    setSaving(true)
    try {
      const expiresAt = expiryFrom(expiry)
      const share = existing
        ? await api<Share>(`/shares/${existing.id}`, { method: "PATCH", body: { expiresAt, leafMessageId } })
        : await api<Share>("/shares", { method: "POST", body: { conversationId, leafMessageId, expiresAt } })
      setExisting(share)
      notify.success(existing ? t("components.share.updateSuccess") : t("components.share.success"))
    } catch (error) {
      notify.error(error)
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    if (!existing) return
    await navigator.clipboard.writeText(shareUrl(existing.id))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("components.share.title")}</DialogTitle>
          <DialogDescription>{existing ? t("components.share.updateDescription") : t("components.share.description")}</DialogDescription>
        </DialogHeader>
        {checking ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>{t("components.share.expirationLabel")}</FieldLabel>
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
            </Field>
            {existing && (
              <Field>
                <FieldLabel htmlFor="share-url">{t("components.share.linkLabel")}</FieldLabel>
                <div className="flex gap-2">
                  <Input id="share-url" readOnly value={shareUrl(existing.id)} onFocus={(e) => e.target.select()} />
                  <Button variant="outline" size="icon" aria-label={t("components.share.copy")} onClick={copy}>
                    {copied ? <CheckIcon /> : <CopyIcon />}
                  </Button>
                </div>
              </Field>
            )}
          </FieldGroup>
        )}
        <DialogFooter>
          <Button onClick={save} disabled={saving || checking || !leafMessageId}>
            {saving && <Spinner data-icon="inline-start" />}
            {existing ? t("components.share.updateButton") : t("components.share.createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
