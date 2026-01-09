import { useState, useEffect } from "react";
import { User, Lock, Wrench, Plus, Trash2, RefreshCw, Pencil, Power, PowerOff, Share2, ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
} from "@/components/ui/sidebar";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MCPConfig, MCPTool } from "@/page/chat/types";

export default function SettingsPanel() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState("account");

    const tabs = [
        { id: "account", label: t("pages.settings.tabs.account"), icon: User },
        { id: "mcp", label: t("pages.settings.tabs.mcp"), icon: Wrench },
        { id: "share", label: t("pages.settings.tabs.share"), icon: Share2 },
    ];

    return (
        <SidebarProvider
            defaultOpen={true}
            style={{
                "--sidebar-width": "16rem",
            } as React.CSSProperties}
        >
            <div className="flex h-full w-full bg-background text-foreground">
                <Sidebar collapsible="none" className="border-r">
                    <SidebarHeader className="p-4">
                        <h2 className="text-lg font-semibold tracking-tight">
                            {t("pages.settings.title")}
                        </h2>
                    </SidebarHeader>
                    <SidebarContent>
                        <SidebarGroup>
                            <SidebarMenu>
                                {tabs.map((tab) => (
                                    <SidebarMenuItem key={tab.id}>
                                        <SidebarMenuButton
                                            isActive={activeTab === tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                        >
                                            <tab.icon className="size-4" />
                                            <span>{tab.label}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroup>
                    </SidebarContent>
                </Sidebar>

                {/* Right Content */}
                <main className="flex-1 min-w-0">
                    <ScrollArea className="h-[85vh]">
                        <div className="p-6 pt-8 space-y-8">
                            {activeTab === "account" && <AccountSettings />}
                            {activeTab === "mcp" && <MCPSettings />}
                            {activeTab === "share" && <ShareSettings />}
                        </div>
                    </ScrollArea>
                </main>
            </div>
        </SidebarProvider>
    );
}

function AccountSettings() {
    const { t } = useTranslation();
    const { user, updateUser } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [isPasswordLoading, setIsPasswordLoading] = useState(false);

    // Profile State
    const [username, setUsername] = useState(user?.username || "");
    const [avatar, setAvatar] = useState(user?.avatar || "");

    // Password State
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");

    // Initialize state when user loads
    useEffect(() => {
        if (user) {
            setUsername(user.username || "");
            setAvatar(user.avatar || "");
        }
    }, [user]);

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatar(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleUpdateProfile = async () => {
        if (!username) {
            toast.error(t("pages.settings.account.usernameRequired"));
            return;
        }

        setIsLoading(true);
        try {
            await api.put("/api/user", {
                username,
                avatar,
            });
            updateUser({ username, avatar });
            toast.success(t("pages.settings.account.success"));
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.account.error"));
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!oldPassword || !newPassword) {
            toast.error(t("pages.settings.security.fillAll"));
            return;
        }

        setIsPasswordLoading(true);
        try {
            await api.put("/api/user/password", {
                old_password: oldPassword,
                password: newPassword,
            });
            toast.success(t("pages.settings.security.success"));
            setOldPassword("");
            setNewPassword("");
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.security.error"));
        } finally {
            setIsPasswordLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-medium flex items-center gap-2">
                        <User className="size-4" />
                        {t("pages.settings.account.title")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {t("pages.settings.account.description")}
                    </p>
                </div>
                <Separator />

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="username">{t("pages.settings.account.username")}</Label>
                        <Input
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder={t("pages.settings.account.usernamePlaceholder")}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="avatar">{t("pages.settings.account.avatar")}</Label>
                        <div className="flex items-center gap-4">
                            <Avatar className="h-16 w-16">
                                <AvatarImage src={avatar} />
                                <AvatarFallback>{username ? username.substring(0, 2).toUpperCase() : "U"}</AvatarFallback>
                            </Avatar>
                            <Input
                                id="avatar"
                                type="file"
                                accept="image/*"
                                onChange={handleAvatarUpload}
                                className="cursor-pointer"
                            />
                        </div>
                    </div>
                    <Button
                        onClick={handleUpdateProfile}
                        disabled={isLoading}
                        className="w-fit"
                    >
                        {isLoading ? t("pages.settings.account.saving") : t("pages.settings.account.save")}
                    </Button>
                </div>
            </div>

            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-medium flex items-center gap-2">
                        <Lock className="size-5" />
                        {t("pages.settings.security.title")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {t("pages.settings.security.description")}
                    </p>
                </div>
                <Separator />

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="old-password">{t("pages.settings.security.currentPassword")}</Label>
                        <Input
                            id="old-password"
                            type="password"
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            placeholder={t("pages.settings.security.currentPasswordPlaceholder")}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="new-password">{t("pages.settings.security.newPassword")}</Label>
                        <Input
                            id="new-password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={t("pages.settings.security.newPasswordPlaceholder")}
                        />
                    </div>
                    <Button
                        onClick={handleUpdatePassword}
                        disabled={isPasswordLoading}
                        variant="secondary"
                        className="w-fit"
                    >
                        {isPasswordLoading ? t("pages.settings.security.updating") : t("pages.settings.security.update")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function MCPSettings() {
    const { t } = useTranslation();
    const [mcpConfigs, setMcpConfigs] = useState<MCPConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<MCPConfig | null>(null);
    const [refreshingId, setRefreshingId] = useState<string | null>(null);

    // Form state
    const [formName, setFormName] = useState("");
    const [formConnectionType, setFormConnectionType] = useState("http");
    const [formEndpoint, setFormEndpoint] = useState("");
    const [formHeaders, setFormHeaders] = useState("");
    const [formIsActive, setFormIsActive] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Fetch MCP configs
    const fetchConfigs = async () => {
        setIsLoading(true);
        try {
            const result = await api.get<MCPConfig[]>("/api/mcp");
            setMcpConfigs(result || []);
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.mcp.fetchError"));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchConfigs();
    }, []);

    const openAddDialog = () => {
        setEditingConfig(null);
        setFormName("");
        setFormConnectionType("http");
        setFormEndpoint("");
        setFormHeaders("");
        setFormIsActive(true);
        setIsDialogOpen(true);
    };

    const openEditDialog = (config: MCPConfig) => {
        setEditingConfig(config);
        setFormName(config.name);
        setFormConnectionType(config.connection_type);
        setFormEndpoint(config.endpoint);
        setFormHeaders(config.headers ? JSON.stringify(config.headers, null, 2) : "");
        setFormIsActive(config.is_active);
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formName || !formEndpoint) {
            toast.error(t("pages.settings.mcp.fillRequired"));
            return;
        }

        let headers: Record<string, string> | undefined;
        if (formHeaders.trim()) {
            try {
                headers = JSON.parse(formHeaders);
            } catch {
                toast.error(t("pages.settings.mcp.invalidHeaders"));
                return;
            }
        }

        setIsSaving(true);
        try {
            if (editingConfig) {
                await api.put(`/api/mcp/${editingConfig.id}`, {
                    name: formName,
                    connection_type: formConnectionType,
                    endpoint: formEndpoint,
                    headers,
                    is_active: formIsActive,
                });
                toast.success(t("pages.settings.mcp.updateSuccess"));
            } else {
                await api.post("/api/mcp", {
                    name: formName,
                    connection_type: formConnectionType,
                    endpoint: formEndpoint,
                    headers,
                    is_active: formIsActive,
                });
                toast.success(t("pages.settings.mcp.createSuccess"));
            }
            setIsDialogOpen(false);
            fetchConfigs();
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.mcp.saveError"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t("pages.settings.mcp.confirmDelete"))) return;

        try {
            await api.del(`/api/mcp/${id}`);
            toast.success(t("pages.settings.mcp.deleteSuccess"));
            fetchConfigs();
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.mcp.deleteError"));
        }
    };

    const handleRefreshTools = async (id: string) => {
        setRefreshingId(id);
        try {
            const result = await api.post<{ tools: MCPTool[] }>(`/api/mcp/${id}/refresh`);
            toast.success(t("pages.settings.mcp.refreshSuccess", { count: result.tools?.length || 0 }));
            fetchConfigs();
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.mcp.refreshError"));
        } finally {
            setRefreshingId(null);
        }
    };

    const handleToggleActive = async (config: MCPConfig) => {
        try {
            await api.put(`/api/mcp/${config.id}`, {
                is_active: !config.is_active,
            });
            fetchConfigs();
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.mcp.toggleError"));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-medium flex items-center gap-2">
                        <Wrench className="size-4" />
                        {t("pages.settings.mcp.title")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {t("pages.settings.mcp.description")}
                    </p>
                </div>
                <Button onClick={openAddDialog} size="sm">
                    <Plus className="size-4 mr-1" />
                    {t("pages.settings.mcp.add")}
                </Button>
            </div>
            <Separator />

            {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                    {t("common.loading")}
                </div>
            ) : mcpConfigs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    {t("pages.settings.mcp.empty")}
                </div>
            ) : (
                <div className="space-y-4">
                    {mcpConfigs.map((config) => (
                        <Card key={config.id} className={!config.is_active ? "opacity-60" : ""}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-base">{config.name}</CardTitle>
                                        <Badge variant={config.is_active ? "default" : "secondary"}>
                                            {config.is_active ? t("pages.settings.mcp.active") : t("pages.settings.mcp.inactive")}
                                        </Badge>
                                        <Badge variant="outline">{config.connection_type}</Badge>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleToggleActive(config)}
                                            title={config.is_active ? t("pages.settings.mcp.deactivate") : t("pages.settings.mcp.activate")}
                                        >
                                            {config.is_active ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRefreshTools(config.id)}
                                            disabled={refreshingId === config.id}
                                            title={t("pages.settings.mcp.refreshTools")}
                                        >
                                            <RefreshCw className={`size-4 ${refreshingId === config.id ? "animate-spin" : ""}`} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditDialog(config)}
                                            title={t("common.edit")}
                                        >
                                            <Pencil className="size-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDelete(config.id)}
                                            title={t("common.delete")}
                                        >
                                            <Trash2 className="size-4 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                                <CardDescription className="font-mono text-xs truncate">
                                    {config.endpoint}
                                </CardDescription>
                            </CardHeader>
                            {config.tools && config.tools.length > 0 && (
                                <CardContent className="pt-0">
                                    <div className="flex flex-wrap gap-1">
                                        {config.tools.map((tool, idx) => (
                                            <Badge key={idx} variant="secondary" className="text-xs">
                                                {tool.name}
                                            </Badge>
                                        ))}
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    ))}
                </div>
            )}

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {editingConfig ? t("pages.settings.mcp.editTitle") : t("pages.settings.mcp.addTitle")}
                        </DialogTitle>
                        <DialogDescription>
                            {t("pages.settings.mcp.dialogDescription")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="mcp-name">{t("pages.settings.mcp.name")}</Label>
                            <Input
                                id="mcp-name"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                placeholder={t("pages.settings.mcp.namePlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="mcp-type">{t("pages.settings.mcp.connectionType")}</Label>
                            <Select value={formConnectionType} onValueChange={setFormConnectionType}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="http">HTTP</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="mcp-endpoint">{t("pages.settings.mcp.endpoint")}</Label>
                            <Input
                                id="mcp-endpoint"
                                value={formEndpoint}
                                onChange={(e) => setFormEndpoint(e.target.value)}
                                placeholder={t("pages.settings.mcp.endpointPlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="mcp-headers">{t("pages.settings.mcp.headers")}</Label>
                            <Textarea
                                id="mcp-headers"
                                value={formHeaders}
                                onChange={(e) => setFormHeaders(e.target.value)}
                                placeholder={t("pages.settings.mcp.headersPlaceholder")}
                                className="font-mono text-xs h-24"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="mcp-active"
                                checked={formIsActive}
                                onCheckedChange={setFormIsActive}
                            />
                            <Label htmlFor="mcp-active">{t("pages.settings.mcp.active")}</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? t("common.actions.saving") : t("common.actions.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

interface ShareItem {
    id: string;
    conversation_title: string;
    created_at: string;
    expires_at: string;
}

function ShareSettings() {
    const { t } = useTranslation();
    const [shares, setShares] = useState<ShareItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingShare, setEditingShare] = useState<ShareItem | null>(null);
    const [newExpiresAt, setNewExpiresAt] = useState("");
    const [isUpdating, setIsUpdating] = useState(false);

    const fetchShares = async () => {
        setIsLoading(true);
        try {
            const result = await api.get<ShareItem[]>("/api/share");
            setShares(result || []);
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.share.fetchError"));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchShares();
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm(t("pages.settings.share.confirmDelete"))) return;

        try {
            await api.del(`/api/share/${id}`);
            toast.success(t("pages.settings.share.deleteSuccess"));
            fetchShares();
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.share.deleteError"));
        }
    };

    const openEditDialog = (share: ShareItem) => {
        setEditingShare(share);
        setNewExpiresAt("7days");
        setIsEditDialogOpen(true);
    };

    const getExpirationDate = (option: string): string => {
        const now = new Date();
        switch (option) {
            case "1hour":
                now.setHours(now.getHours() + 1);
                break;
            case "1day":
                now.setDate(now.getDate() + 1);
                break;
            case "7days":
                now.setDate(now.getDate() + 7);
                break;
            case "30days":
                now.setDate(now.getDate() + 30);
                break;
            case "never":
                return "";
            default:
                now.setDate(now.getDate() + 7);
        }
        return now.toISOString();
    };

    const handleUpdate = async () => {
        if (!editingShare) return;

        setIsUpdating(true);
        try {
            await api.put(`/api/share/${editingShare.id}`, {
                expires_at: getExpirationDate(newExpiresAt),
            });
            toast.success(t("pages.settings.share.updateSuccess"));
            setIsEditDialogOpen(false);
            fetchShares();
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.share.updateError"));
        } finally {
            setIsUpdating(false);
        }
    };

    const copyShareLink = (id: string) => {
        const link = `${window.location.origin}/share/${id}`;
        navigator.clipboard.writeText(link);
        toast.success(t("pages.settings.share.copied"));
    };

    const openShareLink = (id: string) => {
        window.open(`/share/${id}`, "_blank");
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return t("pages.settings.share.never");
        return new Date(dateStr).toLocaleString();
    };

    const isExpired = (expiresAt: string) => {
        if (!expiresAt) return false;
        return new Date(expiresAt) < new Date();
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-medium flex items-center gap-2">
                    <Share2 className="size-4" />
                    {t("pages.settings.share.title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {t("pages.settings.share.description")}
                </p>
            </div>
            <Separator />

            {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                    {t("common.loading")}
                </div>
            ) : shares.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    {t("pages.settings.share.empty")}
                </div>
            ) : (
                <div className="space-y-4">
                    {shares.map((share) => (
                        <Card key={share.id} className={isExpired(share.expires_at) ? "opacity-60" : ""}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-base">
                                            {share.conversation_title || t("pages.settings.share.untitled")}
                                        </CardTitle>
                                        {isExpired(share.expires_at) && (
                                            <Badge variant="secondary">
                                                {t("pages.settings.share.expired")}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => copyShareLink(share.id)}
                                            title={t("pages.settings.share.copyLink")}
                                        >
                                            <Copy className="size-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openShareLink(share.id)}
                                            title={t("pages.settings.share.openLink")}
                                        >
                                            <ExternalLink className="size-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditDialog(share)}
                                            title={t("common.actions.update")}
                                        >
                                            <RefreshCw className="size-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDelete(share.id)}
                                            title={t("common.actions.delete")}
                                        >
                                            <Trash2 className="size-4 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                                <CardDescription className="text-xs">
                                    <span>{t("pages.settings.share.createdAt")}: {formatDate(share.created_at)}</span>
                                    <span className="mx-2">•</span>
                                    <span>{t("pages.settings.share.expiresAt")}: {formatDate(share.expires_at)}</span>
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            )}

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {t("pages.settings.share.editTitle")}
                        </DialogTitle>
                        <DialogDescription>
                            {t("pages.settings.share.editDescription")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>{t("pages.settings.share.conversation")}</Label>
                            <p className="text-sm text-muted-foreground">
                                {editingShare?.conversation_title || t("pages.settings.share.untitled")}
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="expires-at">{t("pages.settings.share.newExpiration")}</Label>
                            <Select value={newExpiresAt} onValueChange={setNewExpiresAt}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1hour">{t("components.share.expiration.1hour")}</SelectItem>
                                    <SelectItem value="1day">{t("components.share.expiration.1day")}</SelectItem>
                                    <SelectItem value="7days">{t("components.share.expiration.7days")}</SelectItem>
                                    <SelectItem value="30days">{t("components.share.expiration.30days")}</SelectItem>
                                    <SelectItem value="never">{t("components.share.expiration.never")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleUpdate} disabled={isUpdating}>
                            {isUpdating ? t("common.loading") : t("common.actions.update")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
