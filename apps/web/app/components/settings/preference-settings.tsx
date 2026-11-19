import type { Preferences } from "@flai/shared"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { PanelSection } from "~/components/panel-dialog"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import { api } from "~/lib/api"
import { notificationAccess } from "~/lib/browser-notifications"
import { notify } from "~/lib/notify"
import { useAppStore } from "~/store/app-store"
import { useAuthStore, usePreferences } from "~/store/auth-store"

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

function BrowserNotificationsField() {
  const { t } = useTranslation()
  const enabled = useAppStore((s) => s.browserNotifications)
  const setEnabled = useAppStore((s) => s.setBrowserNotifications)
  const [access, setAccess] = useState(notificationAccess)

  const toggle = async (checked: boolean) => {
    if (checked && access === "default") {
      const result = await Notification.requestPermission()
      setAccess(result)
      if (result !== "granted") return
    }
    setEnabled(checked)
  }

  const description = { unsupported: "Unsupported", denied: "Blocked", default: "Description", granted: "Description" }[access]

  return (
    <Field orientation="horizontal" className="items-center py-4">
      <FieldContent>
        <FieldLabel htmlFor="pref-browser-notifications">{t("pages.settings.preference.browserNotifications")}</FieldLabel>
        <FieldDescription>{t(`pages.settings.preference.browserNotifications${description}`)}</FieldDescription>
      </FieldContent>
      <Switch
        id="pref-browser-notifications"
        checked={enabled && access === "granted"}
        disabled={access === "unsupported" || access === "denied"}
        onCheckedChange={(checked) => void toggle(checked)}
      />
    </Field>
  )
}

export function PreferenceSettings() {
  const { t, i18n } = useTranslation()
  const preferences = usePreferences()
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
            checked={preferences.sidebarShowEmoji}
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
            checked={preferences.chatHistory}
            onCheckedChange={(checked) => void update({ chatHistory: checked })}
          />
        </Field>
        <BrowserNotificationsField />
      </FieldGroup>
    </PanelSection>
  )
}
