import { BrainIcon, Share2Icon, SlidersHorizontalIcon, UserIcon, WrenchIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { PanelDialog } from "~/components/panel-dialog"
import { AccountSettings } from "./account-settings"
import { McpSettings } from "./mcp-settings"
import { MemorySettings } from "./memory-settings"
import { PreferenceSettings } from "./preference-settings"
import { ShareSettings } from "./share-settings"

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  return (
    <PanelDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("pages.settings.title")}
      tabs={[
        { id: "account", label: t("pages.settings.tabs.account"), icon: UserIcon, render: () => <AccountSettings /> },
        { id: "mcp", label: t("pages.settings.tabs.mcp"), icon: WrenchIcon, render: () => <McpSettings /> },
        { id: "preference", label: t("pages.settings.tabs.preference"), icon: SlidersHorizontalIcon, render: () => <PreferenceSettings /> },
        { id: "memory", label: t("pages.settings.tabs.memory"), icon: BrainIcon, render: () => <MemorySettings /> },
        { id: "share", label: t("pages.settings.tabs.share"), icon: Share2Icon, render: () => <ShareSettings /> },
      ]}
    />
  )
}
