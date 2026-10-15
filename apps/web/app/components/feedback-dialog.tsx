import { BugIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog"
import { Field, FieldDescription } from "~/components/ui/field"
import { Spinner } from "~/components/ui/spinner"
import { Textarea } from "~/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"

const MAX = 2000

export function FeedbackDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState("")
  const [sending, setSending] = useState(false)

  const submit = async () => {
    if (!content.trim()) return
    setSending(true)
    try {
      await api("/feedback", { method: "POST", body: { content: content.trim() } })
      notify.success(t("components.feedback.success"))
      setContent("")
      setOpen(false)
    } catch (error) {
      notify.error(error)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && setOpen(next)}>
      <Tooltip>
        <TooltipTrigger render={<DialogTrigger render={<Button variant="ghost" size="icon" aria-label={t("components.feedback.title")} />} />}>
          <BugIcon />
        </TooltipTrigger>
        <TooltipContent>{t("components.feedback.title")}</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("components.feedback.title")}</DialogTitle>
          <DialogDescription>{t("components.feedback.description")}</DialogDescription>
        </DialogHeader>
        <Field>
          <Textarea
            value={content}
            maxLength={MAX}
            rows={6}
            placeholder={t("components.feedback.placeholder")}
            onChange={(e) => setContent(e.target.value)}
          />
          <FieldDescription className="text-right tabular-nums">
            {[...content].length}/{MAX}
          </FieldDescription>
        </Field>
        <DialogFooter>
          <Button onClick={submit} disabled={sending || !content.trim()}>
            {sending && <Spinner data-icon="inline-start" />}
            {t("components.feedback.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
