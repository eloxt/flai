import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/lib/api";
import { normalizePreference } from "@/lib/user-preferences";

export function PreferenceSettings() {
    const { t } = useTranslation();
    const { user, updateUser } = useAuthStore();
    const [isSaving, setIsSaving] = useState(false);
    const [showSidebarEmoji, setShowSidebarEmoji] = useState(true);

    useEffect(() => {
        const preference = normalizePreference(user?.preference);
        setShowSidebarEmoji(preference.sidebar_show_emoji ?? true);
    }, [user?.preference]);

    const handleToggle = async (checked: boolean) => {
        if (isSaving || !user) return;
        const previousValue = showSidebarEmoji;
        setShowSidebarEmoji(checked);
        setIsSaving(true);

        const currentPreference = normalizePreference(user?.preference);
        const nextPreference = {
            ...currentPreference,
            sidebar_show_emoji: checked,
        };

        try {
            await api.put("/api/user/preference", {
                preference: nextPreference,
            });
            updateUser({ preference: nextPreference });
            toast.success(t("pages.settings.preference.updateSuccess"));
        } catch (error: any) {
            setShowSidebarEmoji(previousValue);
            toast.error(error.message || t("pages.settings.preference.updateError"));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-medium flex items-center gap-2">
                    <SlidersHorizontal className="size-4" />
                    {t("pages.settings.preference.title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {t("pages.settings.preference.description")}
                </p>
            </div>
            <Separator />

            <div className="flex items-center justify-between gap-6 px-2">
                <Label className="text-sm font-medium">
                    {t("pages.settings.preference.sidebarEmoji")}
                </Label>
                <Switch
                    checked={showSidebarEmoji}
                    onCheckedChange={handleToggle}
                    disabled={isSaving || !user}
                    aria-label={t("pages.settings.preference.sidebarEmoji")}
                />
            </div>
        </div>
    );
}
