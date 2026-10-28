import { ArrowLeftIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { BrandMark } from "~/components/brand-mark"
import i18n from "~/i18n"

export const meta = () => [{ title: `FlaiChat - ${i18n.t("pages.privacy.title")}` }]

const SECTIONS = ["collect", "use", "models", "sharing", "retention", "rights"] as const

export default function Privacy() {
  const { t } = useTranslation()
  return (
    <div className="h-svh overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-10 px-4 py-12 md:py-20">
        <header className="flex flex-col gap-6">
          <BrandMark className="text-base" />
          <h1 className="text-title text-3xl leading-tight font-light tracking-tight text-balance md:text-4xl">{t("pages.privacy.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("pages.privacy.updated")}</p>
          <p className="leading-relaxed">{t("pages.privacy.intro")}</p>
        </header>
        {SECTIONS.map((key) => (
          <section key={key} className="flex flex-col gap-2">
            <h2 className="text-lg font-medium tracking-tight">{t(`pages.privacy.sections.${key}.title`)}</h2>
            <p className="leading-relaxed text-muted-foreground">{t(`pages.privacy.sections.${key}.body`)}</p>
          </section>
        ))}
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" />
          {t("pages.privacy.back")}
        </Link>
      </div>
    </div>
  )
}
