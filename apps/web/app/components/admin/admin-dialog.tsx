import { BellIcon, FileTextIcon, ServerIcon, SirenIcon, SparklesIcon, UsersIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { PanelDialog } from "~/components/panel-dialog"
import { NotificationSettings } from "./notification-settings"
import { ProviderManagement } from "./provider-management"
import { ErrorAlertSettings, SystemPromptSettings, TitleGenerationSettings } from "./system-settings"
import { UserManagement } from "./user-management"

export function AdminDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  return (
    <PanelDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("pages.admin.title")}
      tabs={[
        { id: "users", label: t("pages.admin.tabs.users"), icon: UsersIcon, render: () => <UserManagement /> },
        { id: "providers", label: t("pages.admin.tabs.providers"), icon: ServerIcon, render: () => <ProviderManagement /> },
        { id: "systemPrompt", label: t("pages.admin.systemConfig.systemPrompt"), icon: FileTextIcon, render: () => <SystemPromptSettings /> },
        { id: "title", label: t("pages.admin.systemConfig.titleGeneration"), icon: SparklesIcon, render: () => <TitleGenerationSettings /> },
        { id: "errorAlert", label: t("pages.admin.tabs.errorAlert"), icon: SirenIcon, render: () => <ErrorAlertSettings /> },
        { id: "notification", label: t("pages.admin.tabs.notification"), icon: BellIcon, render: () => <NotificationSettings /> },
      ]}
    />
  )
}
