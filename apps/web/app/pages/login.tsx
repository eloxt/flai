import type { AuthResult } from "@flai/shared"
import { type FormEvent, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Button } from "~/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"
import i18n from "~/i18n"
import { api, ApiError } from "~/lib/api"
import { notify } from "~/lib/notify"
import { useAuthStore } from "~/store/auth-store"

export const meta = () => [{ title: `FlaiChat - ${i18n.t("pages.login.submit")}` }]

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      login(await api<AuthResult>("/auth/login", { method: "POST", body: { email, password }, auth: false }))
      navigate("/", { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.code === "USER_INACTIVE") navigate("/activation-pending", { replace: true })
      else notify.error(error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <h1 className="text-title py-1 text-3xl leading-tight font-light tracking-tight text-balance md:text-4xl">{t("pages.login.welcome")}</h1>
        <Field>
          <FieldLabel htmlFor="email">{t("pages.login.email")}</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("pages.login.placeholder.email")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">{t("pages.login.password")}</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("pages.login.placeholder.password")}
          />
        </Field>
        <Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? t("pages.login.submitting") : t("pages.login.submit")}
          </Button>
        </Field>
        <FieldSeparator>{t("pages.login.noAccount")}</FieldSeparator>
        <Field>
          <Button variant="outline" type="button" className="w-full" onClick={() => navigate("/register")}>
            {t("pages.login.register")}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
