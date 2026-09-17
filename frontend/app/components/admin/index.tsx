import { Users, Server, Bell, BellRing, TextCursorInput, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PanelLayout, PanelTab } from "@/components/panel-layout";
import { UserManagement } from "./user-management";
import { ProviderManagement } from "./provider-management";
import { NotificationSettings } from "./notification-settings";
import { ErrorAlertSettings } from "./error-alert-settings";

import { SystemConfigSettings } from "./system-config-settings";

export default function AdminPanel() {
    const { t } = useTranslation();

    const tabs: PanelTab[] = [
        {
            id: "users",
            label: t("pages.admin.tabs.users"),
            icon: Users,
            component: <UserManagement />
        },
        {
            id: "providers",
            label: t("pages.admin.tabs.providers"),
            icon: Server,
            component: <ProviderManagement />
        },
        {
            id: "system-prompt",
            label: t("pages.admin.systemConfig.systemPrompt"),
            icon: FileText,
            component: <SystemConfigSettings key="system_prompt" configKey="system_prompt" />
        },
        {
            id: "title-generation",
            label: t("pages.admin.systemConfig.titleGeneration"),
            icon: TextCursorInput,
            component: <SystemConfigSettings key="title_generation" configKey="title_generation" />
        },
        {
            id: "error-alert",
            label: t("pages.admin.tabs.errorAlert"),
            icon: BellRing,
            component: <ErrorAlertSettings />
        },
        {
            id: "notification",
            label: t("pages.admin.tabs.notification"),
            icon: Bell,
            component: <NotificationSettings />
        },
    ];

    return (
        <PanelLayout
            title={t("pages.admin.title")}
            tabs={tabs}
            defaultTab="users"
        />
    );
}
