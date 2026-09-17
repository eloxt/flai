import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";

export function ErrorAlertSettings() {
    const { t } = useTranslation();
    const [barkURL, setBarkURL] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setLoadFailed(false);
        api.get<{ bark_url: string }>("/admin/error-alert")
            .then((result) => {
                if (active) setBarkURL(result.bark_url);
            })
            .catch((error: unknown) => {
                if (active) {
                    setLoadFailed(true);
                    toast.error(error instanceof Error ? error.message : t("common.crud.fetchError"));
                }
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => { active = false; };
    }, [t]);

    const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            const value = barkURL.trim();
            await api.put("/admin/error-alert", { bark_url: value });
            setBarkURL(value);
            toast.success(t("common.crud.updateSuccess"));
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : t("pages.admin.errorAlert.saveError"));
        } finally {
            setIsSaving(false);
        }
    };

    const disabled = isLoading || loadFailed || isSaving;

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h3 className="flex items-center gap-2 text-xl font-medium">
                    <BellRing className="size-5" />
                    {t("pages.admin.errorAlert.title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {t("pages.admin.errorAlert.description")}
                </p>
            </div>
            <Separator />
            <form onSubmit={handleSave} className="flex max-w-xl flex-col gap-6">
                <FieldGroup>
                    <Field data-disabled={disabled}>
                        <FieldLabel htmlFor="bark-url">{t("pages.admin.errorAlert.urlLabel")}</FieldLabel>
                        <Input
                            id="bark-url"
                            type="url"
                            autoComplete="off"
                            value={barkURL}
                            onChange={(event) => setBarkURL(event.target.value)}
                            placeholder={t("pages.admin.errorAlert.placeholder")}
                            maxLength={2048}
                            disabled={disabled}
                            aria-describedby="bark-url-description"
                        />
                        <FieldDescription id="bark-url-description">
                            {t("pages.admin.errorAlert.help")}
                        </FieldDescription>
                    </Field>
                </FieldGroup>
                <Button type="submit" className="self-start" disabled={disabled}>
                    {isSaving ? t("pages.settings.account.saving") : t("common.actions.save")}
                </Button>
            </form>
        </div>
    );
}
