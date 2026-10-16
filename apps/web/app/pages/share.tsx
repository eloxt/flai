import type { PublicShare } from "@flai/shared"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router"
import { ImageProxyContext } from "~/components/proxied-image"
import { type Theme, useTheme } from "~/components/theme-provider"
import { Button } from "~/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty"
import { Message, MessageContent } from "~/components/ui/message"
import { Skeleton } from "~/components/ui/skeleton"
import { MessageBody } from "~/features/chat/components/message-body"
import { api, ApiError } from "~/lib/api"
import { formatDateTime } from "~/lib/format"

const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" }
const THEME_ICON = { system: MonitorIcon, light: SunIcon, dark: MoonIcon }

export default function SharePage() {
  const { t } = useTranslation()
  const { id = "" } = useParams()
  const { theme, setTheme } = useTheme()
  const [share, setShare] = useState<PublicShare | null>(null)
  const [error, setError] = useState<"notFound" | "error" | null>(null)
  const ThemeIcon = THEME_ICON[theme]

  useEffect(() => {
    api<PublicShare>(`/public/shares/${id}`, { auth: false })
      .then((s) => {
        setShare(s)
        document.title = `FlaiChat - ${s.title || t("pages.share.untitled")}`
      })
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? "notFound" : "error"))
  }, [id, t])

  return (
    <div className="flex h-dvh flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-4 px-4 md:px-8">
          <span className="text-xl">{share?.icon}</span>
          <h1 className="min-w-0 flex-1 truncate text-base font-normal tracking-tight">{share ? share.title || t("pages.share.untitled") : "FlaiChat"}</h1>
          <Button variant="ghost" size="icon" aria-label={t("components.sidebar.theme.title")} onClick={() => setTheme(NEXT_THEME[theme])}>
            <ThemeIcon />
          </Button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 md:px-8 md:py-16">
        {error ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{error === "notFound" ? t("pages.share.notFound") : t("pages.share.error")}</EmptyTitle>
              {error === "notFound" && <EmptyDescription>{t("pages.share.notFoundDescription")}</EmptyDescription>}
            </EmptyHeader>
          </Empty>
        ) : !share ? (
          <div className="flex flex-col gap-6">
            <Skeleton className="ml-auto h-10 w-2/5" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <ImageProxyContext value={`/public/shares/${share.id}/images`}>
            {share.messages.map((m) => (
              <Message key={m.id} align={m.role === "user" ? "end" : "start"}>
                <MessageContent className={m.role === "user" ? "items-end" : "w-full"}>
                  <MessageBody role={m.role} parts={m.parts} metadata={m.metadata} />
                </MessageContent>
              </Message>
            ))}
          </ImageProxyContext>
        )}
      </main>
      {share && (
        <footer className="border-t">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-8 text-xs tracking-wide text-muted-foreground uppercase tabular-nums md:px-8">
            <span>
              {t("pages.share.sharedOn")} {formatDateTime(share.createdAt)}
            </span>
            {share.expiresAt && (
              <span>
                {t("pages.share.expiresOn")} {formatDateTime(share.expiresAt)}
              </span>
            )}
            <a className="ml-auto inline-flex min-h-11 items-center underline-offset-4 hover:underline" href="https://github.com/eloxt/flai" target="_blank" rel="noopener noreferrer">
              FlaiChat
            </a>
          </div>
        </footer>
      )}
    </div>
  )
}
