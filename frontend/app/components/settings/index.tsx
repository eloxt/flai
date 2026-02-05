import { User, Wrench, Share2, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PanelLayout, PanelTab } from "@/components/panel-layout";
import { AccountSettings } from "./account-settings";
import { MCPSettings } from "./mcp-settings";
import { ShareSettings } from "./share-settings";
import { PreferenceSettings } from "./preference-settings";

export default function SettingsPanel() {
    const { t } = useTranslation();

    const tabs: PanelTab[] = [
        {
            id: "account",
            label: t("pages.settings.tabs.account"),
            icon: User,
            component: <AccountSettings />
        },
        {
            id: "mcp",
            label: t("pages.settings.tabs.mcp"),
            icon: Wrench,
            component: <MCPSettings />
        },
        {
            id: "preference",
            label: t("pages.settings.tabs.preference"),
            icon: SlidersHorizontal,
            component: <PreferenceSettings />
        },
        {
            id: "share",
            label: t("pages.settings.tabs.share"),
            icon: Share2,
            component: <ShareSettings />
        },
    ];

    return (
        <PanelLayout
            title={t("pages.settings.title")}
            tabs={tabs}
            defaultTab="account"
        />
    );
}
