import { useTranslation } from "react-i18next"
import { Outlet } from "react-router"
import { BrandMark } from "~/components/brand-mark"

export default function AuthLayout() {
  const { t } = useTranslation()
  return (
    <div className="relative grid h-svh grid-cols-12 overflow-y-auto bg-sidebar">
      <div aria-hidden="true" className="material-grid pointer-events-none absolute inset-x-0 top-0 h-[70svh]" />
      {/* Poster column: only on wide screens, where there is room for horizontal tension. */}
      <aside className="relative hidden flex-col justify-between gap-16 p-8 lg:col-span-5 lg:flex xl:p-16">
        <BrandMark className="text-base" />
        <p className="text-title max-w-[12ch] py-2 text-6xl leading-none font-light tracking-tight text-balance xl:text-7xl">{t("pages.chat.greeting")}</p>
      </aside>
      <main className="relative col-span-12 flex flex-col px-4 py-16 md:px-8 md:py-24 lg:col-span-7 lg:justify-center">
        <BrandMark className="mb-16 text-base lg:hidden" />
        <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-lg sm:p-8 lg:mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
