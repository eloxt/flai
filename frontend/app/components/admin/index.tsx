import { Users, Server, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PanelLayout, PanelTab } from "@/components/panel-layout";
import { UserManagement } from "./user-management";
import { ProviderManagement } from "./provider-management";
import { NotificationSettings } from "./notification-settings";

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
