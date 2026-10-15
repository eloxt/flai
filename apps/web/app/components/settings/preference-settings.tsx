import type { Preferences } from "@flai/shared"
import { useTranslation } from "react-i18next"
import { PanelSection } from "~/components/panel-dialog"
import { Field, FieldContent, FieldLabel } from "~/components/ui/field"
import { Switch } from "~/components/ui/switch"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"
import { useAuthStore } from "~/store/auth-store"

export function PreferenceSettings() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)

  const update = async (patch: Preferences) => {
    const previous = user?.preferences ?? {}
    updateUser({ preferences: { ...previous, ...patch } })
    try {
      updateUser({ preferences: await api<Preferences>("/me/preferences", { method: "PATCH", body: patch }) })
    } catch (error) {
      updateUser({ preferences: previous })
      notify.error(error)
    }
  }

  return (
    <PanelSection title={t("pages.settings.preference.title")} description={t("pages.settings.preference.description")}>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="pref-emoji">{t("pages.settings.preference.sidebarEmoji")}</FieldLabel>
        </FieldContent>
        <Switch
          id="pref-emoji"
          checked={user?.preferences.sidebarShowEmoji ?? true}
          onCheckedChange={(checked) => void update({ sidebarShowEmoji: checked })}
        />
      </Field>
    </PanelSection>
  )
}
