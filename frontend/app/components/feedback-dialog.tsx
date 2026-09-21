import { useState } from "react";
import { Bug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

export default function FeedbackDialog() {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [content, setContent] = useState("");
    const [sending, setSending] = useState(false);

    return (
        <Dialog open={open} onOpenChange={(value) => { if (!sending) setOpen(value); }}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title={t("components.feedback.title")} aria-label={t("components.feedback.title")}>
                    <Bug />
                </Button>
            </DialogTrigger>
            <DialogContent aria-describedby={undefined} showCloseButton={!sending}>
                <DialogTitle>{t("components.feedback.title")}</DialogTitle>
                <form className="flex flex-col gap-4" onSubmit={async (event) => {
                    event.preventDefault();
                    if (sending || !content.trim()) return;
                    setSending(true);
                    try {
                        await api.post("/api/user/feedback", { content: content.trim() });
                        toast.success(t("components.feedback.success"));
                        setContent("");
                        setOpen(false);
                    } catch {
                        toast.error(t("components.feedback.error"));
                    } finally {
                        setSending(false);
                    }
                }}>
                    <FieldGroup>
                        <Field data-disabled={sending}>
                            <FieldLabel htmlFor="feedback-content" className="sr-only">{t("components.feedback.content")}</FieldLabel>
                            <Textarea
                                id="feedback-content"
                                placeholder={t("components.feedback.placeholder")}
                                value={content}
                                onChange={(event) => setContent(event.target.value)}
                                maxLength={2000}
                                required
                                disabled={sending}
                                className="min-h-32 max-h-80"
                            />
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <Button type="submit" disabled={sending || !content.trim()}>
                            {sending ? t("components.feedback.sending") : t("common.send")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
