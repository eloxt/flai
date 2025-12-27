
import {
    LogOut,
    Plus,
    Search,
    RefreshCw,
    Trash,
    EllipsisVertical,
    Construction,
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
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSkeleton,
    useSidebar,
} from "@/components/ui/sidebar"
import SettingsPanel from "./settings-panel";
import { Button } from "./ui/button";

export default function AppSidebar() {
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
    const { toggleSidebar } = useSidebar()

    useEffect(() => {
        if (tokens?.access_token) {
            fetchConversations();
        }
    }, [tokens?.access_token]);


    const quickActions = [
        { label: t("sidebar.newChat"), icon: Plus, to: "/" },
        { label: t("sidebar.searchChat"), icon: Search, to: "/search" },
    ];

    const handleDelete = (id: string) => {
        setConversationToDelete(id);
    }

    return (
        <>
            <Sidebar collapsible="icon" variant="sidebar">
                <SidebarHeader>
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
                        <span className="text-base font-semibold w-full pl-2 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:pl-0 transition-[width,opacity,padding] duration-200">
                            FlaiChat
                        </span>

                        <Button variant="ghost" onClick={toggleSidebar} className="hidden p-2! md:block group-data-[collapsible=icon]:opacity-0 transition-[width,opacity] duration-200">
                            <PanelLeft className="size-4" />
                        </Button>
                    </div>
                </SidebarHeader>
                <SidebarContent>

                    <SidebarGroup>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {quickActions.map((action) => (
                                    <SidebarMenuItem key={action.label}>
                                        <SidebarMenuButton asChild tooltip={action.label} isActive={location.pathname === action.to}>
                                            <NavLink to={action.to} >
                                                <action.icon />
                                                <span>{action.label}</span>
                                            </NavLink>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>

                    <SidebarGroup className="group-data-[collapsible=icon]:opacity-0 transition-opacity opacity-100 duration-200">
                        <div className="px-2 py-2 text-xs font-semibold text-muted-foreground">
                            {t("sidebar.chats")}
                        </div>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {isLoading ? (
                                    <div className="px-4 py-2 text-sm text-muted-foreground">{t("loading")}</div>
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
                                                            {t("sidebar.regenerateTitle")}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            variant="destructive"
                                                            onClick={() => handleDelete(chat.id)}
                                                        >
                                                            <Trash className="mr-2 size-4" />
                                                            {t("sidebar.delete")}
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

                <SidebarFooter>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <SidebarMenuButton
                                        size="lg"
                                        className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                                    >
                                        <Avatar className="h-8 w-8 rounded-lg">
                                            <AvatarImage src="" alt={user?.username || "User"} />
                                            <AvatarFallback className="rounded-lg">
                                                {getInitials(user?.username)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="grid flex-1 text-left text-sm leading-tight">
                                            <span className="truncate font-semibold">{user?.username || "User"}</span>
                                            <span className="truncate text-xs">{user?.email || "user@example.com"}</span>
                                        </div>
                                        <EllipsisVertical className="ml-auto size-4" />
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
                                                <AvatarImage src="" alt={user?.username || "User"} />
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
                                                <span>{t("sidebar.adminSettings")}</span>
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem onClick={() => setShowSettingsDialog(true)}>
                                            <Settings className="mr-2 size-4" />
                                            <span>{t("sidebar.settings")}</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />

                                    <DropdownMenuItem onClick={logout}>
                                        <LogOut className="mr-2 size-4" />
                                        {t("sidebar.logout")}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>
            </Sidebar>

            <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
                <DialogContent className="sm:max-w-5xl w-full p-0 gap-0 overflow-hidden outline-none">
                    <SettingsPanel />
                </DialogContent>
            </Dialog>

            <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("sidebar.adminSettings")}</DialogTitle>
                    </DialogHeader>
                    <div className="flex h-full w-full items-center justify-center p-4">
                        <Empty>
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Construction className="size-6" />
                                </EmptyMedia>
                                <EmptyTitle>Settings Under Construction</EmptyTitle>
                                <EmptyDescription>
                                    We are working hard to bring you the best settings experience. Please
                                    check back later.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!conversationToDelete} onOpenChange={(open) => !open && setConversationToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete your conversation and remove it from our servers.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
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
                        >Confirm</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
