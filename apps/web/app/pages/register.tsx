import type { User } from "@flai/shared"
import { type FormEvent, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Button } from "~/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"
import i18n from "~/i18n"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"

export const meta = () => [{ title: `FlaiChat - ${i18n.t("pages.register.submit")}` }]

export default function Register() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: "", username: "", password: "" })
  const [submitting, setSubmitting] = useState(false)
  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      await api<{ user: User }>("/auth/register", { method: "POST", body: form, auth: false })
      notify.success(t("pages.register.success"))
      navigate("/activation-pending", { replace: true })
    } catch (error) {
      notify.error(error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <h1 className="text-3xl leading-tight font-light tracking-tight text-balance md:text-4xl">{t("pages.register.title")}</h1>
        <Field>
          <FieldLabel htmlFor="email">{t("pages.register.email")}</FieldLabel>
          <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={update("email")} placeholder={t("pages.register.placeholder.email")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="username">{t("pages.register.username")}</FieldLabel>
          <Input id="username" autoComplete="username" required minLength={5} maxLength={20} value={form.username} onChange={update("username")} placeholder={t("pages.register.placeholder.username")} />
          <FieldDescription>{t("pages.register.usernameHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="password">{t("pages.register.password")}</FieldLabel>
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={update("password")} placeholder={t("pages.register.placeholder.password")} />
        </Field>
        <Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? t("pages.register.submitting") : t("pages.register.submit")}
          </Button>
        </Field>
        <FieldSeparator>{t("pages.register.hasAccount")}</FieldSeparator>
        <Field>
          <Button variant="outline" type="button" className="w-full" onClick={() => navigate("/login")}>
            {t("pages.register.login")}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
