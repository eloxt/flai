import type { Notification } from "@flai/shared"
import { cn } from "cn"
import { BellIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "~/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import { api } from "~/lib/api"
import { useAppStore } from "~/store/app-store"

export function NotificationBell() {
  const { t, i18n } = useTranslation()
  const read = useAppStore((s) => s.dismissedNotifications)
  const markRead = useAppStore((s) => s.dismissNotification)
  const [items, setItems] = useState<Notification[]>([])
  // Unread items stay highlighted while the list is open, even though opening marks them read.
  const [highlighted, setHighlighted] = useState<string[]>([])

  useEffect(() => {
    api<Notification[]>("/notifications").then(setItems).catch(() => {})
  }, [])

  const unread = items.filter((n) => !read.includes(n.id))
  const label = t("components.notifications.title")

  const onOpenChange = (open: boolean) => {
    if (open) {
      setHighlighted(unread.map((n) => n.id))
      unread.forEach((n) => markRead(n.id))
    }
  }

  return (
    <Popover onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={<Button variant="ghost" size="icon" aria-label={label} className="relative" />}
            />
          }
        >
          <BellIcon />
          {unread.length > 0 && (
            <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-medium text-white tabular-nums">
              {unread.length > 99 ? "99+" : unread.length}
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="px-3 py-2.5 text-sm font-medium">{label}</div>
        {items.length === 0 ? (
          <p className="px-3 pb-4 text-sm text-muted-foreground">{t("components.notifications.empty")}</p>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="flex flex-col pb-1">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn("flex gap-2.5 px-3 py-2.5", highlighted.includes(n.id) && "bg-muted/60")}
                >
                  {n.level === "warning" ? (
                    <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                  ) : (
                    <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{n.title}</p>
                    {n.content && (
                      <p className="mt-0.5 text-sm whitespace-pre-wrap break-words text-muted-foreground">
                        {n.content}
                      </p>
                    )}
                    <time dateTime={n.createdAt} className="mt-1 block text-xs text-muted-foreground tabular-nums">
                      {new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium" }).format(
                        new Date(n.createdAt)
                      )}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
