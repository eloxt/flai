import { cn } from "cn"
import {
  ChevronDownIcon,
  EllipsisVerticalIcon,
  LanguagesIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PanelLeftIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
  StarOffIcon,
  SunIcon,
  SunMoonIcon,
  Trash2Icon,
  UserCogIcon,
} from "lucide-react"
import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useLocation, useNavigate } from "react-router"
import { useShallow } from "zustand/react/shallow"
import { ConfirmDialog } from "~/components/confirm-dialog"
import { FlaiMark } from "~/components/flai-mark"
import { type Theme, useTheme } from "~/components/theme-provider"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "~/components/ui/sidebar"
import { Skeleton } from "~/components/ui/skeleton"
import { Spinner } from "~/components/ui/spinner"
import { initials } from "~/lib/format"
import { useAuthStore, usePreferences } from "~/store/auth-store"
import { type ConversationItem, useConversationStore } from "~/store/conversation-store"

const AdminDialog = lazy(() => import("../admin/admin-dialog").then((module) => ({ default: module.AdminDialog })))
const SettingsDialog = lazy(() => import("../settings/settings-dialog").then((module) => ({ default: module.SettingsDialog })))

const DAY = 24 * 3600 * 1000
// Collapsing to the icon rail fades the list out (as in the previous UI) and then drops it from the tab order.
const FADE_ON_COLLAPSE =
  "transition-[opacity,visibility] duration-200 group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:invisible group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none"
const TITLE_FADE = "transition-opacity duration-200 ease-out starting:opacity-0"
const GROUPS = ["today", "yesterday", "previous7Days", "previous30Days", "older"] as const

function groupByDate(items: ConversationItem[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const bounds = [today, today - DAY, today - 7 * DAY, today - 30 * DAY]
  const groups = GROUPS.map((group) => ({ group, items: [] as ConversationItem[] }))
  for (const item of items) {
    const at = new Date(item.createdAt).getTime()
    const index = bounds.findIndex((b) => at >= b)
    groups[index === -1 ? 4 : index]!.items.push(item)
  }
  return groups.filter((g) => g.items.length > 0)
}

export function AppSidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { toggleSidebar, isMobile, setOpenMobile } = useSidebar()
  const user = useAuthStore((s) => s.user)
  const showEmoji = usePreferences().sidebarShowEmoji
  // Everything but `replying`, which changes on every send and finish; each row watches its own entry.
  const { conversations, favourites, loading, loadingMore, nextCursor, loaded, load, loadMore, remove } = useConversationStore(
    useShallow(({ conversations, favourites, loading, loadingMore, nextCursor, loaded, load, loadMore, remove }) => ({
      conversations, favourites, loading, loadingMore, nextCursor, loaded, load, loadMore, remove,
    }))
  )
  // Mount each dialog on first use, then keep it mounted for its closing transition.
  const [settingsOpen, setSettingsOpen] = useState<boolean>()
  const [adminOpen, setAdminOpen] = useState<boolean>()
  const [toDelete, setToDelete] = useState<string | null>(null)
  const grouped = useMemo(() => groupByDate(conversations), [conversations])

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  // Close the mobile drawer after navigating.
  useEffect(() => {
    if (isMobile) setOpenMobile(false)
  }, [location.pathname, isMobile, setOpenMobile])

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) void loadMore()
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    await remove(toDelete)
    if (location.pathname === `/chat/${toDelete}`) navigate("/")
  }

  return (
    <>
      {/* With the title bar folded in, the expanded sidebar's top row sits in it, clear of the window
          controls; the collapsed rail is too narrow for that and starts below. */}
      <Sidebar collapsible="icon" variant="inset" className="wco:pt-(--titlebar) wco:group-data-[state=expanded]:pt-0">
        <SidebarHeader className="wco:group-data-[state=expanded]:pt-0">
          <div className="flex h-8 items-center gap-2 overflow-hidden wco:group-data-[state=expanded]:h-(--titlebar) wco:group-data-[state=expanded]:pl-[max(0px,calc(var(--titlebar-x)-1rem))]">
            {/* Expanded: the logo is static and the collapse button sits on the right (desktop only).
                Collapsed: the logo itself is the expand button and shows the panel icon on hover. */}
            <span className="flex size-8 shrink-0 items-center justify-center group-data-[collapsible=icon]:hidden">
              <FlaiMark className="size-4" />
            </span>
            <Button variant="ghost" size="icon" className="group/brand hidden shrink-0 group-data-[collapsible=icon]:flex" aria-label={t("components.sidebar.toggle")} onClick={toggleSidebar}>
              <FlaiMark className="group-hover/brand:hidden" />
              <PanelLeftIcon className="hidden group-hover/brand:block" />
            </Button>
            <span className={cn("min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-title", FADE_ON_COLLAPSE)}>FlaiChat</span>
            {!isMobile && (
              <Button variant="ghost" size="icon" className={cn("shrink-0", FADE_ON_COLLAPSE)} aria-label={t("components.sidebar.toggle")} onClick={toggleSidebar}>
                <PanelLeftIcon />
              </Button>
            )}
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={t("components.sidebar.newChat")} isActive={location.pathname === "/"} render={<NavLink to="/" />}>
                <PlusIcon />
                <span>{t("components.sidebar.newChat")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={t("components.sidebar.searchChat")} isActive={location.pathname === "/search"} render={<NavLink to="/search" />}>
                <SearchIcon />
                <span>{t("components.sidebar.searchChat")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={t("components.sidebar.translate")} isActive={location.pathname === "/translate"} render={<NavLink to="/translate" />}>
                <LanguagesIcon />
                <span>{t("components.sidebar.translate")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent onScroll={onScroll}>
          {favourites.length > 0 && (
            <Collapsible defaultOpen>
              <SidebarGroup className={FADE_ON_COLLAPSE}>
                <SidebarGroupLabel className="group-data-[collapsible=icon]:mt-0" render={<CollapsibleTrigger className="group/fav" />}>
                  {t("components.sidebar.favourites")}
                  <ChevronDownIcon className="ml-auto transition-transform group-data-[panel-open]/fav:rotate-180" />
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {favourites.map((c) => (
                        <ConversationRow key={c.id} item={c} favourite showEmoji={showEmoji} onDelete={setToDelete} />
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )}
          {loading && !loaded ? (
            <SidebarGroup className={FADE_ON_COLLAPSE}>
              <SidebarMenu>
                {Array.from({ length: 6 }, (_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ) : (
            grouped.map(({ group, items }) => (
              <SidebarGroup key={group} className={FADE_ON_COLLAPSE}>
                <SidebarGroupLabel className="group-data-[collapsible=icon]:mt-0">{t(`components.sidebar.dateGroups.${group}`)}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((c) => (
                      <ConversationRow key={c.id} item={c} showEmoji={showEmoji} onDelete={setToDelete} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))
          )}
          {nextCursor && (
            <div className={cn("px-4 py-2 text-center", FADE_ON_COLLAPSE)}>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? t("common.loading") : t("components.sidebar.loadMore")}
              </Button>
            </div>
          )}
        </SidebarContent>

        <SidebarFooter>
          <UserMenu onSettings={() => setSettingsOpen(true)} onAdmin={() => setAdminOpen(true)} />
        </SidebarFooter>
      </Sidebar>

      <Suspense fallback={null}>
        {settingsOpen !== undefined && <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />}
        {user?.role === "admin" && adminOpen !== undefined && <AdminDialog open={adminOpen} onOpenChange={setAdminOpen} />}
      </Suspense>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t("components.sidebar.deleteConfirm.title")}
        description={t("components.sidebar.deleteConfirm.description")}
        confirmLabel={t("common.actions.delete")}
        destructive
        onConfirm={confirmDelete}
      />
    </>
  )
}

function ConversationRow({
  item,
  favourite = false,
  showEmoji,
  onDelete,
}: {
  item: ConversationItem
  favourite?: boolean
  showEmoji: boolean
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  const location = useLocation()
  const setFavourite = useConversationStore((s) => s.setFavourite)
  const generateTitle = useConversationStore((s) => s.generateTitle)
  const rename = useConversationStore((s) => s.rename)
  const [editing, setEditing] = useState(false)
  const replying = useConversationStore((s) => Boolean(s.replying[item.id]))
  const busy = item.generating || replying
  const title = item.title || t("components.sidebar.untitled")
  // Titles that replace the loading placeholder fade in; rows that mount with a title don't.
  const [titleArrives, setTitleArrives] = useState(false)
  useEffect(() => {
    if (item.generating) setTitleArrives(true)
  }, [item.generating])
  if (editing) {
    const finish = (input: HTMLInputElement, save: boolean) => {
      // Escape unmounts the input, which can fire one last blur.
      if (input.dataset.done) return
      input.dataset.done = "true"
      setEditing(false)
      const next = input.value.trim()
      if (save && next) void rename(item.id, next)
    }
    return (
      <SidebarMenuItem>
        <SidebarInput
          autoFocus
          defaultValue={item.title}
          maxLength={200}
          aria-label={t("components.sidebar.rename")}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => finish(e.currentTarget, true)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === "Enter") e.currentTarget.blur()
            else if (e.key === "Escape") {
              e.preventDefault()
              finish(e.currentTarget, false)
            }
          }}
        />
      </SidebarMenuItem>
    )
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={location.pathname === `/chat/${item.id}`} render={<NavLink to={`/chat/${item.id}`} title={title} />}>
        {showEmoji && item.icon && <span className={cn("shrink-0", titleArrives && TITLE_FADE)}>{item.icon}</span>}
        {item.generating ? (
          <Skeleton className="h-4 flex-1" />
        ) : (
          <span className={cn("flex-1 truncate", titleArrives && TITLE_FADE)}>{title}</span>
        )}
        {busy && <Spinner aria-label={t("common.generating")} className="ml-auto motion-reduce:animate-none" />}
      </SidebarMenuButton>
      {!item.generating && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuAction showOnHover aria-label={t("components.sidebar.more")} />}>
            <EllipsisVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => void setFavourite(item.id, !favourite)}>
                {favourite ? <StarOffIcon /> : <StarIcon />}
                {favourite ? t("components.sidebar.removeFavourite") : t("components.sidebar.addFavourite")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <PencilIcon />
                {t("components.sidebar.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void generateTitle(item.id)}>
                <RefreshCwIcon />
                {t("components.sidebar.regenerateTitle")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(item.id)}>
                <Trash2Icon />
                {t("components.sidebar.delete")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </SidebarMenuItem>
  )
}

function UserMenu({ onSettings, onAdmin }: { onSettings: () => void; onAdmin: () => void }) {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const identity = (
    <>
      <Avatar className="size-8 rounded-md after:rounded-md">
        {user?.avatar && <AvatarImage className="rounded-md" src={user.avatar} alt={user.username} />}
        <AvatarFallback className="rounded-md bg-primary text-primary-foreground material-ink">{initials(user?.username)}</AvatarFallback>
      </Avatar>
      <span className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user?.username}</span>
        <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
      </span>
    </>
  )
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}>{identity}</DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-(--anchor-width) min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 font-normal text-foreground">{identity}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {user?.role === "admin" && (
                <DropdownMenuItem onClick={onAdmin}>
                  <UserCogIcon />
                  {t("components.sidebar.adminSettings")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onSettings}>
                <SettingsIcon />
                {t("components.sidebar.settings")}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <SunMoonIcon />
                  {t("components.sidebar.theme.title")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                    <DropdownMenuRadioItem value="system">
                      <MonitorIcon />
                      {t("components.sidebar.theme.system")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="light">
                      <SunIcon />
                      {t("components.sidebar.theme.light")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      <MoonIcon />
                      {t("components.sidebar.theme.dark")}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={logout}>
                <LogOutIcon />
                {t("components.sidebar.logout")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
