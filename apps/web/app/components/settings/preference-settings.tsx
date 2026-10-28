import type { Preferences } from "@flai/shared"
import { useTranslation } from "react-i18next"
import { PanelSection } from "~/components/panel-dialog"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"
import { useAuthStore } from "~/store/auth-store"

const languages = [
  { value: "zh", label: "简体中文" },
  { value: "en", label: "English" },
]

/** Patch the user's preferences optimistically, rolling back if the server rejects it. */
export function useUpdatePreferences() {
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)
  return async (patch: Preferences) => {
    const previous = user?.preferences ?? {}
    updateUser({ preferences: { ...previous, ...patch } })
    try {
      updateUser({ preferences: await api<Preferences>("/me/preferences", { method: "PATCH", body: patch }) })
    } catch (error) {
      updateUser({ preferences: previous })
      notify.error(error)
    }
  }
}

export function PreferenceSettings() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const update = useUpdatePreferences()

  return (
    <PanelSection title={t("pages.settings.preference.title")} description={t("pages.settings.preference.description")}>
      <FieldGroup className="max-w-xl gap-0 divide-y rounded-lg border border-border bg-card px-4 shadow-(--highlight)">
        <Field orientation="horizontal" className="items-center py-4">
          <FieldContent>
            <FieldLabel htmlFor="pref-language">{t("pages.settings.preference.language")}</FieldLabel>
          </FieldContent>
          <Select
            items={languages}
            value={i18n.resolvedLanguage?.startsWith("zh") ? "zh" : "en"}
            onValueChange={(value) => {
              if (value) void i18n.changeLanguage(value).catch((error) => notify.error(error))
            }}
          >
            <SelectTrigger id="pref-language" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {languages.map((language) => (
                  <SelectItem key={language.value} value={language.value}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field orientation="horizontal" className="items-center py-4">
          <FieldContent>
            <FieldLabel htmlFor="pref-emoji">{t("pages.settings.preference.sidebarEmoji")}</FieldLabel>
          </FieldContent>
          <Switch
            id="pref-emoji"
            checked={user?.preferences.sidebarShowEmoji ?? true}
            onCheckedChange={(checked) => void update({ sidebarShowEmoji: checked })}
          />
        </Field>
        <Field orientation="horizontal" className="items-center py-4">
          <FieldContent>
            <FieldLabel htmlFor="pref-chat-history">{t("pages.settings.preference.chatHistory")}</FieldLabel>
            <FieldDescription>{t("pages.settings.preference.chatHistoryDescription")}</FieldDescription>
          </FieldContent>
          <Switch
            id="pref-chat-history"
            checked={user?.preferences.chatHistory ?? true}
            onCheckedChange={(checked) => void update({ chatHistory: checked })}
          />
        </Field>
      </FieldGroup>
    </PanelSection>
  )
}
