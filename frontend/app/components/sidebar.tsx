
import {
    LogOut,
    Plus,
    Search,
    RefreshCw,
    Trash,
    EllipsisVertical,
    UserCog,
    Settings,
    TentTree,
    PanelLeft,
} from "lucide-react";
import { NavLink, useNavigate, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { useConversationStore } from "../store/conversation-store";
import { getInitials } from "../lib/auth-client";
import { useAuthStore } from "../store/auth-store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "react-i18next";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";

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
} from "@/components/ui/sidebar"
import SettingsPanel from "./settings-panel";
import AdminPanel from "./admin-panel";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { api } from "@/lib/api";
import { useAppStore } from "@/store/app-store";

interface SearchResponse {
    conversation_id: string;
    title: string;
    icon: string;
    created_at: string;
    highlight: string;
}

export default function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const { t } = useTranslation();
    const location = useLocation();
    const user = useAuthStore((state) => state.user);
    const tokens = useAuthStore((state) => state.tokens);
    const logout = useAuthStore((state) => state.logout);
    const conversations = useConversationStore((state) => state.conversations);
    const isLoading = useConversationStore((state) => state.isLoading);
    const fetchConversations = useConversationStore((state) => state.fetchConversations);
    const deleteConversation = useConversationStore((state) => state.deleteConversation);
    const generateTitle = useConversationStore((state) => state.generateTitle);
    const navigate = useNavigate();
    const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
    const [showSettingsDialog, setShowSettingsDialog] = useState(false);
    const [showAdminDialog, setShowAdminDialog] = useState(false);
    const [showSearchDialog, setShowSearchDialog] = useState(false);
    const [queryParam, setQueryParam] = useState<string>("");
    const [searchResults, setSearchResults] = useState<SearchResponse[]>([]);
    const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);
    const { open, setOpen, toggleSidebar } = useSidebar();

    useEffect(() => {
        if (tokens?.access_token) {
            fetchConversations();
        }
    }, [tokens?.access_token]);

    useEffect(() => {
        if (isSidebarOpen !== open) {
            toggleSidebar();
            setOpen(isSidebarOpen);
        }
    }, [isSidebarOpen]);

    const handleDelete = (id: string) => {
        setConversationToDelete(id);
    }

    const handleSearch = async () => {
        try {
            const result = await api.get<SearchResponse[]>(`/api/conversation/search?query=${queryParam}`)
            console.log(result)
            setSearchResults(result);
        } catch (error) {
            setSearchResults([]);
            console.error(error);
        }
    }

    return (
        <>
            <Sidebar collapsible="icon" variant="sidebar" {...props}>
                <SidebarHeader className="transition-colors group-data-[collapsible=icon]:bg-background">
                    <div
                        className="flex items-center justify-between overflow-hidden w-full transition-[width,height,padding] x text-sm"
                    >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md p-2 group-data-[collapsible=icon]:hidden">
                            <TentTree className="size-4" />
                        </div>
                        <Button variant="ghost" onClick={toggleSidebar} className="hidden group-data-[collapsible=icon]:flex rounded-md p-2! h-8! group/toggle">
                            <TentTree className="size-4 group-hover/toggle:hidden" />
                            <PanelLeft className="size-4 hidden group-hover/toggle:block" />
                        </Button>
                        <span className="text-base font-semibold w-full pl-2 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:pl-0 transition-[width,opacity,padding]">
                            FlaiChat
                        </span>

                        <Button variant="ghost" onClick={toggleSidebar} className="hidden p-2! md:block group-data-[collapsible=icon]:opacity-0 transition-[width,opacity]">
                            <PanelLeft className="size-4" />
                        </Button>
                    </div>
                    <SidebarMenu>
                        <SidebarMenuItem key={t("components.sidebar.newChat")}>
                            <SidebarMenuButton asChild tooltip={t("components.sidebar.newChat")} isActive={location.pathname === "/"}>
                                <NavLink to="/" >
                                    <Plus />
                                    <span>{t("components.sidebar.newChat")}</span>
                                </NavLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>

                        <SidebarMenuItem key={t("components.sidebar.searchChat")}>
                            <SidebarMenuButton asChild tooltip={t("components.sidebar.searchChat")} isActive={location.pathname === "/search"}>
                                <div className="cursor-pointer group" onClick={() => setShowSearchDialog(true)}>
                                    <Search />
                                    <span>{t("components.sidebar.searchChat")}</span>
                                </div>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarHeader>

                <SidebarContent className="transition-colors group-data-[collapsible=icon]:bg-background">
                    <SidebarGroup className="group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:pointer-events-none opacity-100 duration-200">
                        <SidebarGroupLabel className="group-data-[collapsible=icon]:mt-0">
                            {t("components.sidebar.chats")}
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {isLoading ? (
                                    <div className="px-4 py-2 text-sm text-muted-foreground">{t("common.loading")}</div>
                                ) : (
                                    conversations.map((chat) => (
                                        <SidebarMenuItem key={chat.id}>
                                            <SidebarMenuButton asChild className="group/item pr-12" isActive={location.pathname === `/chat/${chat.id}`}>
                                                <NavLink to={`/chat/${chat.id}`} title={chat.title}>
                                                    {chat.generating ? (
                                                        <SidebarMenuSkeleton />
                                                    ) : (
                                                        <>
                                                            {chat.icon && <span className="mr-2">{chat.icon}</span>}
                                                            <span className="truncate">{chat.title}</span>
                                                        </>
                                                    )}
                                                </NavLink>
                                            </SidebarMenuButton>
                                            {!chat.generating && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <SidebarMenuAction showOnHover>
                                                            <EllipsisVertical />
                                                            <span className="sr-only">More</span>
                                                        </SidebarMenuAction>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="start">
                                                        <DropdownMenuItem onClick={() => generateTitle(chat.id)}>
                                                            <RefreshCw className="mr-2 size-4" />
                                                            {t("components.sidebar.regenerateTitle")}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            variant="destructive"
                                                            onClick={() => handleDelete(chat.id)}
                                                        >
                                                            <Trash className="mr-2 size-4" />
                                                            {t("components.sidebar.delete")}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </SidebarMenuItem>
                                    ))
                                )}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>

                <SidebarFooter className="transition-colors group-data-[collapsible=icon]:bg-background">
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <SidebarMenuButton
                                        size="lg"
                                        className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                                    >
                                        <Avatar className="h-8 w-8 rounded-lg">
                                            <AvatarImage src={user?.avatar} alt={user?.username || "User"} />
                                            <AvatarFallback className="rounded-lg">
                                                {getInitials(user?.username)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="grid flex-1 text-left text-sm leading-tight">
                                            <span className="truncate font-semibold">{user?.username || "User"}</span>
                                            <span className="truncate text-xs">{user?.email || "user@example.com"}</span>
                                        </div>
                                    </SidebarMenuButton>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                                    side="bottom"
                                    align="end"
                                    sideOffset={4}
                                >
                                    <DropdownMenuLabel className="p-0 font-normal">
                                        <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                            <Avatar className="h-8 w-8 rounded-lg">
                                                <AvatarImage src={user?.avatar} alt={user?.username || "User"} />
                                                <AvatarFallback className="rounded-lg">
                                                    {getInitials(user?.username)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="grid flex-1 text-left text-sm leading-tight">
                                                <span className="truncate font-semibold">{user?.username || "User"}</span>
                                                <span className="truncate text-xs">{user?.email || "user@example.com"}</span>
                                            </div>
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuGroup>
                                        {user?.role === "admin" && (
                                            <DropdownMenuItem onClick={() => setShowAdminDialog(true)}>
                                                <UserCog className="mr-2 size-4" />
                                                <span>{t("components.sidebar.adminSettings")}</span>
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem onClick={() => setShowSettingsDialog(true)}>
                                            <Settings className="mr-2 size-4" />
                                            <span>{t("components.sidebar.settings")}</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />

                                    <DropdownMenuItem onClick={logout}>
                                        <LogOut className="mr-2 size-4" />
                                        {t("components.sidebar.logout")}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>
            </Sidebar>

            <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
                <DialogContent className="sm:max-w-5xl w-full max-h-[85vh] p-0 gap-0 overflow-hidden outline-none">
                    <DialogTitle className="hidden">Settings</DialogTitle>
                    <SettingsPanel />
                </DialogContent>
            </Dialog>

            <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
                <DialogContent className="sm:max-w-5xl w-full max-h-[85vh] p-0 gap-0 overflow-hidden outline-none">
                    <DialogTitle className="hidden">Admin Settings</DialogTitle>
                    <AdminPanel />
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!conversationToDelete} onOpenChange={(open) => !open && setConversationToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("components.sidebar.dialog.deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("components.sidebar.dialog.deleteDescription")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.actions.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (conversationToDelete) {
                                    deleteConversation(conversationToDelete);
                                    if (location.pathname === `/chat/${conversationToDelete}`) {
                                        navigate("/");
                                    }
                                }
                                setConversationToDelete(null);
                            }}
                        >{t("common.actions.confirm")}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={showSearchDialog} onOpenChange={(open) => {
                setShowSearchDialog(open);
                if (!open) {
                    setQueryParam("");
                    setSearchResults([]);
                }
            }}>
                <DialogContent className="p-2">
                    <Command shouldFilter={false}>
                        <CommandInput value={queryParam} onValueChange={setQueryParam} onKeyDown={(e: { key: string; }) => e.key === "Enter" && handleSearch()} placeholder={t("components.sidebar.command.searchPlaceholder")} />
                        <CommandList>
                            <CommandEmpty>{t("components.sidebar.command.empty")}</CommandEmpty>
                            <CommandGroup>
                                {searchResults.map((result, index) => (
                                    <CommandItem key={`${result.conversation_id}-${index}`} asChild>
                                        <NavLink to={`/chat/${result.conversation_id}`} className="flex flex-col items-start gap-1 w-full" onClick={() => setShowSearchDialog(false)}>
                                            <div className="flex items-center gap-2 w-full">
                                                {result.icon && <span>{result.icon}</span>}
                                                <span className="font-medium truncate">{result.title}</span>
                                                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                                                    {new Date(result.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <span
                                                className="text-sm text-muted-foreground line-clamp-2 [&_em]:not-italic [&_em]:font-semibold [&_em]:text-foreground"
                                                dangerouslySetInnerHTML={{ __html: result.highlight }}
                                            />
                                        </NavLink>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </DialogContent>
            </Dialog>
        </>
    );
}
