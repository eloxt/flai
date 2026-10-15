import {
  ChevronDownIcon,
  EllipsisVerticalIcon,
  LanguagesIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PanelLeftIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
  StarOffIcon,
  SunIcon,
  SunMoonIcon,
  TentIcon,
  Trash2Icon,
  UserCogIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useLocation, useNavigate } from "react-router"
import { ConfirmDialog } from "~/components/confirm-dialog"
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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "~/components/ui/sidebar"
import { initials } from "~/lib/format"
import { useAuthStore } from "~/store/auth-store"
import { type ConversationItem, useConversationStore } from "~/store/conversation-store"
import { AdminDialog } from "../admin/admin-dialog"
import { SettingsDialog } from "../settings/settings-dialog"
import { SearchDialog } from "./search-dialog"

const DAY = 24 * 3600 * 1000
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
  const showEmoji = user?.preferences.sidebarShowEmoji ?? true
  const { conversations, favourites, loading, loadingMore, nextCursor, loaded, load, loadMore, remove } = useConversationStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
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
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex h-8 items-center gap-2">
            <Button variant="ghost" size="icon" className="group/brand shrink-0" aria-label={t("components.sidebar.toggle")} onClick={toggleSidebar}>
              <TentIcon className="group-hover/brand:hidden" />
              <PanelLeftIcon className="hidden group-hover/brand:block" />
            </Button>
            <span className="truncate text-base font-semibold group-data-[collapsible=icon]:hidden">FlaiChat</span>
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={t("components.sidebar.newChat")} isActive={location.pathname === "/"} render={<NavLink to="/" />}>
                <PlusIcon />
                <span>{t("components.sidebar.newChat")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={t("components.sidebar.searchChat")} onClick={() => setSearchOpen(true)}>
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

        <SidebarContent onScroll={onScroll} className="group-data-[collapsible=icon]:invisible">
          {favourites.length > 0 && (
            <Collapsible defaultOpen>
              <SidebarGroup>
                <SidebarGroupLabel render={<CollapsibleTrigger className="group/fav" />}>
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
            <SidebarGroup>
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
              <SidebarGroup key={group}>
                <SidebarGroupLabel>{t(`components.sidebar.dateGroups.${group}`)}</SidebarGroupLabel>
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
            <div className="px-4 py-2 text-center">
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

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      {user?.role === "admin" && <AdminDialog open={adminOpen} onOpenChange={setAdminOpen} />}
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
  const { setFavourite, generateTitle } = useConversationStore()
  const title = item.title || t("components.sidebar.untitled")
  return (
    <SidebarMenuItem>
      {item.generating ? (
        <SidebarMenuSkeleton />
      ) : (
        <SidebarMenuButton isActive={location.pathname === `/chat/${item.id}`} render={<NavLink to={`/chat/${item.id}`} title={title} />}>
          {showEmoji && item.icon && <span className="shrink-0">{item.icon}</span>}
          <span className="truncate">{title}</span>
        </SidebarMenuButton>
      )}
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
      <Avatar className="size-8 rounded-lg">
        {user?.avatar && <AvatarImage src={user.avatar} alt={user.username} />}
        <AvatarFallback className="rounded-lg">{initials(user?.username)}</AvatarFallback>
      </Avatar>
      <span className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-semibold">{user?.username}</span>
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
