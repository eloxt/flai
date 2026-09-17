import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { Provider } from "@/types/models";

export function SystemConfigSettings({ configKey }: { configKey: "system_prompt" | "title_generation" }) {
    const { t } = useTranslation();
    const isTitle = configKey === "title_generation";
    const [value, setValue] = useState<Record<string, string>>({});
    const [providers, setProviders] = useState<Provider[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);
        setLoadFailed(false);
        Promise.all([
            api.get<{ value: Record<string, string> }>(`/admin/system-config/${configKey}`, undefined, { signal: controller.signal }),
            isTitle ? api.get<Provider[]>("/api/provider", undefined, { signal: controller.signal }) : Promise.resolve([]),
        ]).then(([config, availableProviders]) => {
            if (controller.signal.aborted) return;
            setValue({ prompt: "", translate: "", ...config.value });
            setProviders(availableProviders);
        }).catch((error: unknown) => {
            if (controller.signal.aborted) return;
            setLoadFailed(true);
            toast.error(error instanceof Error ? error.message : t("common.crud.fetchError"));
        }).finally(() => {
            if (!controller.signal.aborted) setIsLoading(false);
        });
        return () => controller.abort();
    }, [configKey, isTitle, reload, t]);

    const models = providers.find(provider => provider.id === value.provider_id)?.model ?? [];
    const disabled = isLoading || loadFailed || isSaving;
    const validModel = models.some(model => model.id === value.model_name);
    const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (disabled) return;
        setIsSaving(true);
        try {
            await api.put(`/admin/system-config/${configKey}`, { value });
            toast.success(t("pages.admin.systemConfig.saved"));
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : t("common.crud.updateError"));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h3 className="text-xl font-medium">{t(`pages.admin.systemConfig.${isTitle ? "titleGeneration" : "systemPrompt"}`)}</h3>
                <p className="text-sm text-muted-foreground">{t(`pages.admin.systemConfig.${isTitle ? "titleDescription" : "promptDescription"}`)}</p>
            </div>
            <Separator />
            {loadFailed && <Button type="button" variant="outline" className="self-start" onClick={() => setReload(count => count + 1)}>{t("pages.admin.systemConfig.reload")}</Button>}
            <form onSubmit={handleSave} className="flex max-w-3xl flex-col gap-6">
                <FieldGroup>
                    {isTitle && <>
                        <Field data-disabled={disabled}>
                            <FieldLabel htmlFor="title-provider">{t("pages.admin.systemConfig.provider")}</FieldLabel>
                            <Select value={value.provider_id || ""} onValueChange={provider_id => setValue(current => ({ ...current, provider_id, model_name: "" }))} disabled={disabled}>
                                <SelectTrigger id="title-provider" className="w-full"><SelectValue placeholder={t("pages.admin.systemConfig.selectProvider")} /></SelectTrigger>
                                <SelectContent><SelectGroup>
                                    {value.provider_id && !providers.some(provider => provider.id === value.provider_id) && <SelectItem value={value.provider_id} disabled>{value.provider_id} ({t("pages.admin.systemConfig.unavailable")})</SelectItem>}
                                    {providers.map(provider => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}
                                </SelectGroup></SelectContent>
                            </Select>
                        </Field>
                        <Field data-disabled={disabled || models.length === 0}>
                            <FieldLabel htmlFor="title-model">{t("pages.admin.systemConfig.model")}</FieldLabel>
                            <Select value={value.model_name || ""} onValueChange={model_name => setValue(current => ({ ...current, model_name }))} disabled={disabled || models.length === 0}>
                                <SelectTrigger id="title-model" className="w-full"><SelectValue placeholder={t("pages.admin.systemConfig.selectModel")} /></SelectTrigger>
                                <SelectContent><SelectGroup>
                                    {value.model_name && !validModel && <SelectItem value={value.model_name} disabled>{value.model_name} ({t("pages.admin.systemConfig.unavailable")})</SelectItem>}
                                    {models.map(model => <SelectItem key={model.id} value={model.id}>{model.name || model.id}</SelectItem>)}
                                </SelectGroup></SelectContent>
                            </Select>
                            <FieldDescription>{t("pages.admin.systemConfig.modelHelp")}</FieldDescription>
                        </Field>
                    </>}
                    <Field data-disabled={disabled}>
                        <FieldLabel htmlFor={`${configKey}-prompt`}>{t(`pages.admin.systemConfig.${isTitle ? "titlePrompt" : "chatPrompt"}`)}</FieldLabel>
                        <Textarea id={`${configKey}-prompt`} value={value.prompt ?? ""} onChange={event => setValue(current => ({ ...current, prompt: event.target.value }))} disabled={disabled} required={isTitle} maxLength={100000} rows={8} className="field-sizing-fixed" aria-describedby={`${configKey}-help`} />
                        <FieldDescription id={`${configKey}-help`}>{isTitle ? t("pages.admin.systemConfig.titleHelp") : t("pages.admin.systemConfig.chatHelp", { currentDateTime: "{{currentDateTime}}" })}</FieldDescription>
                    </Field>
                    {!isTitle && <Field data-disabled={disabled}>
                        <FieldLabel htmlFor="translate-prompt">{t("pages.admin.systemConfig.translatePrompt")}</FieldLabel>
                        <Textarea id="translate-prompt" value={value.translate ?? ""} onChange={event => setValue(current => ({ ...current, translate: event.target.value }))} disabled={disabled} required maxLength={100000} rows={8} className="field-sizing-fixed" aria-describedby="translate-prompt-help" />
                        <FieldDescription id="translate-prompt-help">{t("pages.admin.systemConfig.translateHelp", { sourceLanguage: "{{sourceLanguage}}", targetLanguage: "{{targetLanguage}}", text: "{{text}}" })}</FieldDescription>
                    </Field>}
                </FieldGroup>
                <Button type="submit" className="self-start" disabled={disabled || (isTitle && !validModel)}>
                    {isSaving ? t("pages.settings.account.saving") : t("common.actions.save")}
                </Button>
            </form>
        </div>
    );
}
