import type { TokenPair, User } from "@flai/shared"
import { type FormEvent, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { PanelSection } from "~/components/panel-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"
import { api } from "~/lib/api"
import { initials } from "~/lib/format"
import { notify } from "~/lib/notify"
import { uploadFile } from "~/lib/upload"
import { useAuthStore } from "~/store/auth-store"

export function AccountSettings() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)
  const [username, setUsername] = useState(user?.username ?? "")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      updateUser(await api<User>("/me", { method: "PATCH", body: { username } }))
      notify.success(t("pages.settings.account.success"))
    } catch (error) {
      notify.error(error)
    } finally {
      setSaving(false)
    }
  }

  const changeAvatar = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) return notify.error(t("common.fileTypeNotAllowed"))
    setUploading(true)
    try {
      const record = await uploadFile(file)
      updateUser(await api<User>("/me", { method: "PATCH", body: { avatarFileId: record.id } }))
    } catch (error) {
      notify.error(error)
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <PanelSection title={t("pages.settings.account.title")} description={t("pages.settings.account.description")}>
        <form onSubmit={saveProfile} className="max-w-xl">
          <FieldGroup>
            <Field>
              <FieldLabel>{t("pages.settings.account.avatar")}</FieldLabel>
              <div className="flex items-center gap-4">
                <Avatar className="size-16 rounded-none after:rounded-none">
                  {user?.avatar && <AvatarImage src={user.avatar} alt={user.username} />}
                  <AvatarFallback className="rounded-none">{initials(user?.username)}</AvatarFallback>
                </Avatar>
                <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void changeAvatar(e.target.files?.[0])} />
                <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
                  {uploading && <Spinner data-icon="inline-start" />}
                  {t("pages.settings.account.changeAvatar")}
                </Button>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="account-email">{t("pages.login.email")}</FieldLabel>
              <Input id="account-email" value={user?.email ?? ""} disabled />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-username">{t("pages.settings.account.username")}</FieldLabel>
              <Input
                id="account-username"
                value={username}
                minLength={5}
                maxLength={20}
                required
                placeholder={t("pages.settings.account.usernamePlaceholder")}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Button type="submit" className="mt-2 self-start" disabled={saving || username.trim() === user?.username}>
              {saving && <Spinner data-icon="inline-start" />}
              {t("pages.settings.account.save")}
            </Button>
          </FieldGroup>
        </form>
      </PanelSection>
      <PasswordSection />
    </>
  )
}

function PasswordSection() {
  const { t } = useTranslation()
  const setTokens = useAuthStore((s) => s.setTokens)
  const [oldPassword, setOld] = useState("")
  const [newPassword, setNew] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      // Changing the password revokes every token, so we receive a fresh pair.
      const { tokens } = await api<{ tokens: TokenPair }>("/me/password", { method: "PUT", body: { oldPassword, newPassword } })
      setTokens(tokens)
      setOld("")
      setNew("")
      notify.success(t("pages.settings.security.success"))
    } catch (error) {
      notify.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PanelSection title={t("pages.settings.security.title")} description={t("pages.settings.security.description")}>
      <form onSubmit={submit} className="max-w-xl">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="old-password">{t("pages.settings.security.currentPassword")}</FieldLabel>
            <Input id="old-password" type="password" autoComplete="current-password" required value={oldPassword} onChange={(e) => setOld(e.target.value)} placeholder={t("pages.settings.security.currentPasswordPlaceholder")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-password">{t("pages.settings.security.newPassword")}</FieldLabel>
            <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNew(e.target.value)} placeholder={t("pages.settings.security.newPasswordPlaceholder")} />
            <FieldDescription>{t("pages.settings.security.hint")}</FieldDescription>
          </Field>
          <Button type="submit" className="mt-2 self-start" disabled={saving}>
            {saving && <Spinner data-icon="inline-start" />}
            {t("pages.settings.security.update")}
          </Button>
        </FieldGroup>
      </form>
    </PanelSection>
  )
}
