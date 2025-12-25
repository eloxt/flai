
import {
    LogOut,
    PanelLeft,
    Plus,
    Search,
    Settings,
    RefreshCw,
    Trash,
    EllipsisVertical,
    Construction,
} from "lucide-react";
import { NavLink } from "react-router";
import { useEffect, useState } from "react";
import { useConversationStore } from "../store/conversation-store";
import { getInitials } from "../lib/auth-client";
import { useAppStore } from "../store/app-store";
import { useAuthStore } from "../store/auth-store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router";
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
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Sidebar() {
    const { t } = useTranslation();
    const isCollapsed = useAppStore((state) => state.isSidebarCollapsed);
    const toggleSidebar = useAppStore((state) => state.toggleSidebar);
    const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);
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

    useEffect(() => {
        if (tokens?.access_token) {
            fetchConversations();
        }
    }, [tokens?.access_token, fetchConversations]);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 768px)");

        if (mediaQuery.matches) {
            setSidebarCollapsed(true);
        }

        const handleChange = (e: MediaQueryListEvent) => {
            if (e.matches) {
                setSidebarCollapsed(true);
            } else {
                setSidebarCollapsed(false);
            }
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, [setSidebarCollapsed]);

    const quickActions: quickAction[] = [
        { label: t("sidebar.newChat"), icon: <Plus />, to: "/" },
        { label: t("sidebar.searchChat"), icon: <Search />, to: "/search" },
    ];

    interface quickAction {
        label: string;
        icon: React.ReactNode;
        to: string;
    }

    return (
        <aside
            className={`flex h-full min-h-0 flex-col gap-1 overflow-visible border-r transition-all duration-300 ${isCollapsed ? "w-14" : "w-64"}`}
            style={{
                backgroundColor: isCollapsed
                    ? "var(--background)"
                    : "var(--secondary)",
                borderColor: "var(--border)",
                color: "var(--primary)",
            }}
        >
            <div className="px-2 pt-2 flex justify-between items-center text-lg">
                <div
                    className={`flex-1 overflow-hidden whitespace-nowrap font-semibold transition-all duration-300 ${isCollapsed ? "max-w-0 opacity-0" : "pl-2 max-w-[160px] opacity-100"}`}
                >
                    FlaiChat
                </div>
                <button
                    onClick={toggleSidebar}
                    className="p-3 flex justify-center items-center rounded-xl transition hover:bg-[var(--color-hover)]"
                    style={{ color: "var(--primary)" }}
                >
                    <PanelLeft className={"size-4"} />
                </button>
            </div>

            <nav className="px-2 mt-3 flex flex-col items-start gap-1">
                {quickActions.map(({ icon, label, to }) => (
                    <NavLink
                        key={label}
                        to={to}
                        className={({ isActive }) =>
                            `px-3 py-2 w-full flex items-center gap-2 rounded-xl transition-colors hover:bg-[var(--color-hover)] ${isActive ? "bg-[var(--color-active)]" : ""
                            }`
                        }
                        style={{ color: "var(--primary)" }}
                    >
                        <div className="size-4 flex items-center justify-center">
                            {icon}
                        </div>
                        <span
                            className={`text-sm truncate transition-all duration-300 ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[160px] opacity-100"}`}
                        >
                            {label}
                        </span>
                    </NavLink>
                ))}
            </nav>

            <div
                className={`px-5 mt-6 text-xs font-semibold tracking-wide transition-opacity duration-300 ${isCollapsed ? "opacity-0" : "opacity-100"}`}
                style={{ color: "var(--muted-foreground)" }}
            >
                {t("sidebar.chats")}
            </div>

            <ScrollArea
                className={`flex grow min-h-0 flex-col pl-3 overflow-hidden pr-1 transition-opacity duration-300 ${isCollapsed ? "opacity-0" : "opacity-100"}`}
            >
                {isLoading ? (
                    <div className="px-2 py-2 text-sm text-[var(--muted-foreground)]">{t("loading")}</div>
                ) : (
                    conversations.map((chat) => (
                        <NavLink
                            key={chat.id}
                            to={`/chat/${chat.id}`}
                            className={({ isActive }) =>
                                `group flex w-full items-center rounded-xl px-2 py-2 text-sm text-left transition hover:bg-[var(--color-hover)] ${isActive ? "bg-[var(--color-active)]" : ""
                                }`
                            }
                            style={{ color: "var(--primary)" }}
                        >
                            {chat.generating ? (
                                <Skeleton className="h-7 w-full bg-[var(--border)]" />
                            ) : (
                                <>
                                    <span className="truncate flex-1">
                                        {chat.icon && chat.icon !== "" && <span className="mr-2 text-lg">{chat.icon}</span>}
                                        {chat.title}
                                    </span>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button className="p-1 hover:bg-[var(--color-active)] rounded-md outline-none"
                                                >
                                                    <EllipsisVertical className="size-4 text-[var(--muted-foreground)]" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start">
                                                <DropdownMenuItem
                                                    onClick={() => generateTitle(chat.id)}
                                                >
                                                    <RefreshCw className="mr-2 size-4" />
                                                    {t("sidebar.regenerateTitle")}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    variant="destructive"
                                                    onClick={() => setConversationToDelete(chat.id)}
                                                >
                                                    <Trash className="mr-2 size-4" />
                                                    {t("sidebar.delete")}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </>
                            )}
                        </NavLink>
                    ))
                )}
            </ScrollArea>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <div
                        className={`flex mx-2 mb-2 items-center gap-2 rounded-xl pl-2 py-2 transition hover:bg-[var(--color-hover)]`}
                        style={{ color: "var(--primary)" }}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="size-6">
                                <AvatarImage>
                                </AvatarImage>
                                <AvatarFallback className="text-[0.6rem]">
                                    {getInitials(user?.username)}
                                </AvatarFallback>
                            </Avatar>
                            <span className={`flex-1 text-sm text-start font-medium truncate transition-opacity ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>
                                {user?.username || "User"}
                            </span>
                        </div>
                    </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                    <DropdownMenuLabel>
                        {user?.email || "user@example.com"}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => setShowSettingsDialog(true)}>
                            <Settings className="size-4" />
                            <span>{t("sidebar.settings")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={logout}>
                            <LogOut className="size-4" />
                            <span>{t("sidebar.logout")}</span>
                        </DropdownMenuItem>
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("sidebar.settings")}</DialogTitle>
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
                                    navigate("/");
                                }
                                setConversationToDelete(null);
                            }}
                        >Confirm</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </aside>
    );
}
