import { useState, useEffect } from "react";
import { Users, Server, Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// Types based on entity models
interface User {
    id: string;
    email: string;
    username: string;
    role: string;
    is_active: number;
    created_at: string;
    avatar: string;
}

// Model cost structure
interface ModelCost {
    input: number;
    output: number;
    reasoning?: number;
    cache_read?: number;
    cache_write?: number;
    input_audio?: number;
    output_audio?: number;
    context_over_200k?: ModelCost;
}

// Model limit structure
interface ModelLimit {
    context: number;
    input?: number;
    output: number;
}

// Model modalities
interface ModelModalities {
    input: Array<"text" | "audio" | "image" | "video" | "pdf">;
    output: Array<"text" | "audio" | "image" | "video" | "pdf">;
}

// Model structure based on models.dev schema
interface Model {
    id: string;
    name: string;
    family?: string;
    attachment: boolean;
    reasoning: boolean;
    tool_call: boolean;
    interleaved?: boolean | { field: "reasoning_content" | "reasoning_details" };
    structured_output?: boolean;
    temperature?: boolean;
    knowledge?: string;
    release_date: string;
    last_updated: string;
    modalities: ModelModalities;
    open_weights: boolean;
    cost?: ModelCost;
    limit: ModelLimit;
    status?: "alpha" | "beta" | "deprecated";
}

interface Provider {
    id: string;
    name: string;
    api_key: string;
    provider_type: string;
    base_url: string;
    model: Model[];
    is_active: number;
    created_at: string;
    logo: string;
}

export default function AdminPanel() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState("users");

    const tabs = [
        { id: "users", label: t("pages.admin.tabs.users"), icon: Users },
        { id: "providers", label: t("pages.admin.tabs.providers"), icon: Server },
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
                            {t("pages.admin.title")}
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
                        <div className="p-6 pt-10 max-w-4xl space-y-8">
                            {activeTab === "users" && <UserManagement />}
                            {activeTab === "providers" && <ProviderManagement />}
                        </div>
                    </ScrollArea>
                </main>
            </div>
        </SidebarProvider>
    );
}

function UserManagement() {
    const { t } = useTranslation();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [userToDelete, setUserToDelete] = useState<string | null>(null);
    const [userToEdit, setUserToEdit] = useState<User | null>(null);

    // Create user form state
    const [newEmail, setNewEmail] = useState("");
    const [newUsername, setNewUsername] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRole, setNewRole] = useState("user");
    const [newIsActive, setNewIsActive] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    // Edit user form state
    const [editEmail, setEditEmail] = useState("");
    const [editUsername, setEditUsername] = useState("");
    const [editPassword, setEditPassword] = useState("");
    const [editRole, setEditRole] = useState("user");
    const [editIsActive, setEditIsActive] = useState(true);
    const [isEditing, setIsEditing] = useState(false);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const res = await api.get<{ list: User[] }>("/admin/user");
            setUsers(res.list || []);
        } catch (error: any) {
            toast.error(error.message || t("pages.admin.users.fetchError"));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleCreateUser = async () => {
        if (!newEmail || !newUsername || !newPassword) {
            toast.error(t("pages.admin.users.fillAll"));
            return;
        }

        setIsCreating(true);
        try {
            await api.post("/admin/user", {
                email: newEmail,
                username: newUsername,
                password: newPassword,
                role: newRole,
                is_active: newIsActive ? 1 : 0,
            });
            toast.success(t("pages.admin.users.createSuccess"));
            setShowCreateDialog(false);
            resetCreateForm();
            fetchUsers();
        } catch (error: any) {
            toast.error(error.message || t("pages.admin.users.createError"));
        } finally {
            setIsCreating(false);
        }
    };

    const resetCreateForm = () => {
        setNewEmail("");
        setNewUsername("");
        setNewPassword("");
        setNewRole("user");
        setNewIsActive(true);
    };

    const openEditDialog = (user: User) => {
        setUserToEdit(user);
        setEditEmail(user.email);
        setEditUsername(user.username);
        setEditPassword("");
        setEditRole(user.role);
        setEditIsActive(user.is_active === 1);
        setShowEditDialog(true);
    };

    const handleEditUser = async () => {
        if (!userToEdit) return;

        setIsEditing(true);
        try {
            const updateData: any = {
                email: editEmail,
                username: editUsername,
                role: editRole,
                is_active: editIsActive ? 1 : 0,
            };
            if (editPassword) {
                updateData.password = editPassword;
            }

            await api.put(`/admin/user/${userToEdit.id}`, updateData);
            toast.success(t("pages.admin.users.updateSuccess"));
            setShowEditDialog(false);
            setUserToEdit(null);
            fetchUsers();
        } catch (error: any) {
            toast.error(error.message || t("pages.admin.users.updateError"));
        } finally {
            setIsEditing(false);
        }
    };

    const handleDeleteUser = async (id: string) => {
        try {
            await api.del(`/admin/user/${id}`);
            toast.success(t("pages.admin.users.deleteSuccess"));
            fetchUsers();
        } catch (error: any) {
            toast.error(error.message || t("pages.admin.users.deleteError"));
        } finally {
            setUserToDelete(null);
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return "-";
        return new Date(dateStr).toISOString().split("T")[0];
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-medium flex items-center gap-2">
                        <Users className="size-5" />
                        {t("pages.admin.users.title")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {t("pages.admin.users.description")}
                    </p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="size-4 mr-2" />
                    {t("pages.admin.users.create")}
                </Button>
            </div>
            <Separator />

            {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("pages.admin.users.table.username")}</TableHead>
                                <TableHead>{t("pages.admin.users.table.email")}</TableHead>
                                <TableHead>{t("pages.admin.users.table.role")}</TableHead>
                                <TableHead>{t("pages.admin.users.table.status")}</TableHead>
                                <TableHead>{t("pages.admin.users.table.createdAt")}</TableHead>
                                <TableHead className="w-[120px]">{t("pages.admin.users.table.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                        {t("pages.admin.users.empty")}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                users.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.username}</TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                                                {user.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {user.is_active ? (
                                                <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                                    <Check className="size-3 mr-1" />
                                                    {t("pages.admin.users.active")}
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary">
                                                    <X className="size-3 mr-1" />
                                                    {t("pages.admin.users.inactive")}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>{formatDate(user.created_at)}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openEditDialog(user)}
                                                >
                                                    <Pencil className="size-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setUserToDelete(user.id)}
                                                    disabled={user.role === "admin"}
                                                >
                                                    <Trash2 className="size-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Create User Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("pages.admin.users.createTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email">{t("pages.admin.users.form.email")}</Label>
                            <Input
                                id="email"
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder={t("pages.admin.users.form.emailPlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="username">{t("pages.admin.users.form.username")}</Label>
                            <Input
                                id="username"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                placeholder={t("pages.admin.users.form.usernamePlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="password">{t("pages.admin.users.form.password")}</Label>
                            <Input
                                id="password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder={t("pages.admin.users.form.passwordPlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="role">{t("pages.admin.users.form.role")}</Label>
                            <Select value={newRole} onValueChange={setNewRole}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">{t("pages.admin.users.roleUser")}</SelectItem>
                                    <SelectItem value="admin">{t("pages.admin.users.roleAdmin")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="isActive"
                                checked={newIsActive}
                                onCheckedChange={setNewIsActive}
                            />
                            <Label htmlFor="isActive">{t("pages.admin.users.form.isActive")}</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleCreateUser} disabled={isCreating}>
                            {isCreating ? t("common.loading") : t("common.actions.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("pages.admin.users.editTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-email">{t("pages.admin.users.form.email")}</Label>
                            <Input
                                id="edit-email"
                                type="email"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                placeholder={t("pages.admin.users.form.emailPlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-username">{t("pages.admin.users.form.username")}</Label>
                            <Input
                                id="edit-username"
                                value={editUsername}
                                onChange={(e) => setEditUsername(e.target.value)}
                                placeholder={t("pages.admin.users.form.usernamePlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-password">{t("pages.admin.users.form.password")}</Label>
                            <Input
                                id="edit-password"
                                type="password"
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                placeholder={t("pages.admin.users.form.passwordPlaceholderOptional")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-role">{t("pages.admin.users.form.role")}</Label>
                            <Select value={editRole} onValueChange={setEditRole}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">{t("pages.admin.users.roleUser")}</SelectItem>
                                    <SelectItem value="admin">{t("pages.admin.users.roleAdmin")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="edit-isActive"
                                checked={editIsActive}
                                onCheckedChange={setEditIsActive}
                            />
                            <Label htmlFor="edit-isActive">{t("pages.admin.users.form.isActive")}</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleEditUser} disabled={isEditing}>
                            {isEditing ? t("common.loading") : t("common.actions.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("pages.admin.users.deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("pages.admin.users.deleteDescription")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.actions.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => userToDelete && handleDeleteUser(userToDelete)}>
                            {t("common.actions.confirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function ProviderManagement() {
    const { t } = useTranslation();
    const [providers, setProviders] = useState<Provider[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [providerToDelete, setProviderToDelete] = useState<string | null>(null);
    const [providerToEdit, setProviderToEdit] = useState<Provider | null>(null);

    // Create provider form state
    const [newName, setNewName] = useState("");
    const [newApiKey, setNewApiKey] = useState("");
    const [newProviderType, setNewProviderType] = useState("");
    const [newBaseUrl, setNewBaseUrl] = useState("");
    const [newModelsJson, setNewModelsJson] = useState("");
    const [newLogo, setNewLogo] = useState("");
    const [newIsActive, setNewIsActive] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    // Edit provider form state
    const [editName, setEditName] = useState("");
    const [editApiKey, setEditApiKey] = useState("");
    const [editProviderType, setEditProviderType] = useState("");
    const [editBaseUrl, setEditBaseUrl] = useState("");
    const [editModelsJson, setEditModelsJson] = useState("");
    const [editLogo, setEditLogo] = useState("");
    const [editIsActive, setEditIsActive] = useState(true);
    const [isEditing, setIsEditing] = useState(false);

    const fetchProviders = async () => {
        setIsLoading(true);
        try {
            const res = await api.get<Provider[]>("/admin/provider");
            setProviders(res || []);
        } catch (error: any) {
            toast.error(error.message || t("pages.admin.providers.fetchError"));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProviders();
    }, []);

    const handleCreateProvider = async () => {
        if (!newName) {
            toast.error(t("pages.admin.providers.nameRequired"));
            return;
        }

        setIsCreating(true);
        try {
            await api.post("/admin/provider", {
                name: newName,
                api_key: newApiKey,
                provider_type: newProviderType,
                base_url: newBaseUrl,
                models: newModelsJson ? JSON.parse(newModelsJson) : [],
                logo: newLogo,
                is_active: newIsActive,
            });
            toast.success(t("pages.admin.providers.createSuccess"));
            setShowCreateDialog(false);
            resetCreateForm();
            fetchProviders();
        } catch (error: any) {
            toast.error(error.message || t("pages.admin.providers.createError"));
        } finally {
            setIsCreating(false);
        }
    };

    const resetCreateForm = () => {
        setNewName("");
        setNewApiKey("");
        setNewProviderType("");
        setNewBaseUrl("");
        setNewModelsJson("");
        setNewLogo("");
        setNewIsActive(true);
    };

    const openEditDialog = (provider: Provider) => {
        setProviderToEdit(provider);
        setEditName(provider.name);
        setEditApiKey("");
        setEditProviderType(provider.provider_type || "");
        setEditBaseUrl(provider.base_url);
        setEditModelsJson(provider.model ? JSON.stringify(provider.model, null, 2) : "");
        setEditLogo(provider.logo);
        setEditIsActive(provider.is_active === 1);
        setShowEditDialog(true);
    };

    const handleEditProvider = async () => {
        if (!providerToEdit) return;

        setIsEditing(true);
        try {
            const updateData: any = {
                name: editName,
                provider_type: editProviderType,
                base_url: editBaseUrl,
                models: editModelsJson ? JSON.parse(editModelsJson) : [],
                logo: editLogo,
                is_active: editIsActive,
            };
            if (editApiKey) {
                updateData.api_key = editApiKey;
            }

            await api.put(`/admin/provider/${providerToEdit.id}`, updateData);
            toast.success(t("pages.admin.providers.updateSuccess"));
            setShowEditDialog(false);
            setProviderToEdit(null);
            fetchProviders();
        } catch (error: any) {
            toast.error(error.message || t("pages.admin.providers.updateError"));
        } finally {
            setIsEditing(false);
        }
    };

    const handleDeleteProvider = async (id: string) => {
        try {
            await api.del(`/admin/provider/${id}`);
            toast.success(t("pages.admin.providers.deleteSuccess"));
            fetchProviders();
        } catch (error: any) {
            toast.error(error.message || t("pages.admin.providers.deleteError"));
        } finally {
            setProviderToDelete(null);
        }
    };

    const maskApiKey = (key: string) => {
        if (!key || key.length < 8) return "••••••••";
        return key.substring(0, 4) + "••••••••" + key.substring(key.length - 4);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-medium flex items-center gap-2">
                        <Server className="size-5" />
                        {t("pages.admin.providers.title")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {t("pages.admin.providers.description")}
                    </p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="size-4 mr-2" />
                    {t("pages.admin.providers.create")}
                </Button>
            </div>
            <Separator />

            {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("pages.admin.providers.table.name")}</TableHead>
                                <TableHead>{t("pages.admin.providers.table.models")}</TableHead>
                                <TableHead>{t("pages.admin.providers.table.providerType")}</TableHead>
                                <TableHead>{t("pages.admin.providers.table.apiKey")}</TableHead>
                                <TableHead>{t("pages.admin.providers.table.status")}</TableHead>
                                <TableHead className="w-[120px]">{t("pages.admin.providers.table.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {providers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                        {t("pages.admin.providers.empty")}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                providers.map((provider) => (
                                    <TableRow key={provider.id}>
                                        <TableCell className="font-medium">{provider.name}</TableCell>
                                        <TableCell>
                                            {provider.model?.length || 0} {t("pages.admin.providers.modelsCount")}
                                        </TableCell>
                                        <TableCell>{provider.provider_type || "-"}</TableCell>
                                        <TableCell className="font-mono text-sm">
                                            {maskApiKey(provider.api_key)}
                                        </TableCell>
                                        <TableCell>
                                            {provider.is_active ? (
                                                <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                                    <Check className="size-3 mr-1" />
                                                    {t("pages.admin.providers.active")}
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary">
                                                    <X className="size-3 mr-1" />
                                                    {t("pages.admin.providers.inactive")}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openEditDialog(provider)}
                                                >
                                                    <Pencil className="size-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setProviderToDelete(provider.id)}
                                                >
                                                    <Trash2 className="size-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Create Provider Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("pages.admin.providers.createTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">{t("pages.admin.providers.form.name")}</Label>
                            <Input
                                id="name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder={t("pages.admin.providers.form.namePlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="apiKey">{t("pages.admin.providers.form.apiKey")}</Label>
                            <Input
                                id="apiKey"
                                type="password"
                                value={newApiKey}
                                onChange={(e) => setNewApiKey(e.target.value)}
                                placeholder={t("pages.admin.providers.form.apiKeyPlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="providerType">{t("pages.admin.providers.form.providerType")}</Label>
                            <Select value={newProviderType} onValueChange={setNewProviderType}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t("pages.admin.providers.form.providerTypePlaceholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="openai">OpenAI</SelectItem>
                                    <SelectItem value="gemini">Google Gemini</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="baseUrl">{t("pages.admin.providers.form.baseUrl")}</Label>
                            <Input
                                id="baseUrl"
                                value={newBaseUrl}
                                onChange={(e) => setNewBaseUrl(e.target.value)}
                                placeholder={t("pages.admin.providers.form.baseUrlPlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="models">{t("pages.admin.providers.form.models")}</Label>
                            <textarea
                                id="models"
                                value={newModelsJson}
                                onChange={(e) => setNewModelsJson(e.target.value)}
                                placeholder={t("pages.admin.providers.form.modelsPlaceholder")}
                                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="logo">{t("pages.admin.providers.form.logo")}</Label>
                            <Input
                                id="logo"
                                value={newLogo}
                                onChange={(e) => setNewLogo(e.target.value)}
                                placeholder={t("pages.admin.providers.form.logoPlaceholder")}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="isActive"
                                checked={newIsActive}
                                onCheckedChange={setNewIsActive}
                            />
                            <Label htmlFor="isActive">{t("pages.admin.providers.form.isActive")}</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleCreateProvider} disabled={isCreating}>
                            {isCreating ? t("common.loading") : t("common.actions.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Provider Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("pages.admin.providers.editTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-name">{t("pages.admin.providers.form.name")}</Label>
                            <Input
                                id="edit-name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder={t("pages.admin.providers.form.namePlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-apiKey">{t("pages.admin.providers.form.apiKey")}</Label>
                            <Input
                                id="edit-apiKey"
                                type="password"
                                value={editApiKey}
                                onChange={(e) => setEditApiKey(e.target.value)}
                                placeholder={t("pages.admin.providers.form.apiKeyPlaceholderOptional")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-providerType">{t("pages.admin.providers.form.providerType")}</Label>
                            <Select value={editProviderType} onValueChange={setEditProviderType}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t("pages.admin.providers.form.providerTypePlaceholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="openai">OpenAI</SelectItem>
                                    <SelectItem value="gemini">Google Gemini</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-baseUrl">{t("pages.admin.providers.form.baseUrl")}</Label>
                            <Input
                                id="edit-baseUrl"
                                value={editBaseUrl}
                                onChange={(e) => setEditBaseUrl(e.target.value)}
                                placeholder={t("pages.admin.providers.form.baseUrlPlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-models">{t("pages.admin.providers.form.models")}</Label>
                            <textarea
                                id="edit-models"
                                value={editModelsJson}
                                onChange={(e) => setEditModelsJson(e.target.value)}
                                placeholder={t("pages.admin.providers.form.modelsPlaceholder")}
                                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-logo">{t("pages.admin.providers.form.logo")}</Label>
                            <Input
                                id="edit-logo"
                                value={editLogo}
                                onChange={(e) => setEditLogo(e.target.value)}
                                placeholder={t("pages.admin.providers.form.logoPlaceholder")}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="edit-isActive"
                                checked={editIsActive}
                                onCheckedChange={setEditIsActive}
                            />
                            <Label htmlFor="edit-isActive">{t("pages.admin.providers.form.isActive")}</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleEditProvider} disabled={isEditing}>
                            {isEditing ? t("common.loading") : t("common.actions.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!providerToDelete} onOpenChange={(open) => !open && setProviderToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("pages.admin.providers.deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("pages.admin.providers.deleteDescription")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.actions.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => providerToDelete && handleDeleteProvider(providerToDelete)}>
                            {t("common.actions.confirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
