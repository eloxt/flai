import { useState, useEffect } from "react";
import {
    Users,
    Plus,
    Trash2,
    Check,
    X,
    Pencil,
    MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Conversation } from "@/store/conversation-store";
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { User } from "@/types/shared";

export function UserManagement() {
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

    // User conversations state
    const [showConversationsDialog, setShowConversationsDialog] =
        useState(false);
    const [userConversations, setUserConversations] = useState<Conversation[]>(
        [],
    );
    const [isLoadingConversations, setIsLoadingConversations] = useState(false);
    const [selectedUserForConversations, setSelectedUserForConversations] =
        useState<User | null>(null);

    const fetchUserConversations = async (userId: string) => {
        setIsLoadingConversations(true);
        setUserConversations([]);
        try {
            const res = await api.get<{ records: Conversation[] }>(
                "/admin/conversation",
                { user_id: userId },
            );
            setUserConversations(res.records || []);
        } catch (error: any) {
            toast.error(
                error.message ||
                    t(
                        "pages.admin.users.fetchConversationsError",
                        "Failed to fetch conversations",
                    ),
            );
        } finally {
            setIsLoadingConversations(false);
        }
    };

    const handleShowConversations = (user: User) => {
        setSelectedUserForConversations(user);
        setShowConversationsDialog(true);
        fetchUserConversations(user.id);
    };

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const res = await api.get<{ list: User[] }>("/admin/user");
            setUsers(res.list || []);
        } catch (error: any) {
            toast.error(error.message || t("common.crud.fetchError"));
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
            toast.success(t("common.crud.createSuccess"));
            setShowCreateDialog(false);
            resetCreateForm();
            fetchUsers();
        } catch (error: any) {
            toast.error(error.message || t("common.crud.createError"));
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
            toast.success(t("common.crud.updateSuccess"));
            setShowEditDialog(false);
            setUserToEdit(null);
            fetchUsers();
        } catch (error: any) {
            toast.error(error.message || t("common.crud.updateError"));
        } finally {
            setIsEditing(false);
        }
    };

    const handleDeleteUser = async (id: string) => {
        try {
            await api.del(`/admin/user/${id}`);
            toast.success(t("common.crud.deleteSuccess"));
            fetchUsers();
        } catch (error: any) {
            toast.error(error.message || t("common.crud.deleteError"));
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
                <div className="text-center py-8 text-muted-foreground">
                    {t("common.loading")}
                </div>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>
                                    {t("pages.admin.users.table.username")}
                                </TableHead>
                                <TableHead>
                                    {t("pages.admin.users.table.email")}
                                </TableHead>
                                <TableHead>
                                    {t("pages.admin.users.table.role")}
                                </TableHead>
                                <TableHead>
                                    {t("pages.admin.users.table.status")}
                                </TableHead>
                                <TableHead>
                                    {t("pages.admin.users.table.createdAt")}
                                </TableHead>
                                <TableHead className="w-[120px]">
                                    {t("pages.admin.users.table.actions")}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={6}
                                        className="text-center text-muted-foreground py-8"
                                    >
                                        {t("common.empty.noItems")}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                users.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">
                                            <span
                                                className="cursor-pointer hover:underline text-primary"
                                                onClick={() =>
                                                    handleShowConversations(
                                                        user,
                                                    )
                                                }
                                            >
                                                {user.username}
                                            </span>
                                        </TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    user.role === "admin"
                                                        ? "default"
                                                        : "secondary"
                                                }
                                            >
                                                {user.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {user.is_active ? (
                                                <Badge
                                                    variant="default"
                                                    className="bg-green-500 hover:bg-green-600"
                                                >
                                                    <Check className="size-3 mr-1" />
                                                    {t(
                                                        "pages.admin.users.active",
                                                    )}
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary">
                                                    <X className="size-3 mr-1" />
                                                    {t(
                                                        "pages.admin.users.inactive",
                                                    )}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {formatDate(user.created_at ?? "")}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        openEditDialog(user)
                                                    }
                                                >
                                                    <Pencil className="size-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        setUserToDelete(user.id)
                                                    }
                                                    disabled={
                                                        user.role === "admin"
                                                    }
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
                        <DialogTitle>
                            {t("pages.admin.users.createTitle")}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email">
                                {t("pages.admin.users.form.email")}
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder={t(
                                    "pages.admin.users.form.emailPlaceholder",
                                )}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="username">
                                {t("pages.admin.users.form.username")}
                            </Label>
                            <Input
                                id="username"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                placeholder={t(
                                    "pages.admin.users.form.usernamePlaceholder",
                                )}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="password">
                                {t("pages.admin.users.form.password")}
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder={t(
                                    "pages.admin.users.form.passwordPlaceholder",
                                )}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="role">
                                {t("pages.admin.users.form.role")}
                            </Label>
                            <Select value={newRole} onValueChange={setNewRole}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">
                                        {t("pages.admin.users.roleUser")}
                                    </SelectItem>
                                    <SelectItem value="admin">
                                        {t("pages.admin.users.roleAdmin")}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="isActive"
                                checked={newIsActive}
                                onCheckedChange={setNewIsActive}
                            />
                            <Label htmlFor="isActive">
                                {t("pages.admin.users.form.isActive")}
                            </Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowCreateDialog(false)}
                        >
                            {t("common.actions.cancel")}
                        </Button>
                        <Button
                            onClick={handleCreateUser}
                            disabled={isCreating}
                        >
                            {isCreating
                                ? t("common.loading")
                                : t("common.actions.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t("pages.admin.users.editTitle")}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-email">
                                {t("pages.admin.users.form.email")}
                            </Label>
                            <Input
                                id="edit-email"
                                type="email"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                placeholder={t(
                                    "pages.admin.users.form.emailPlaceholder",
                                )}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-username">
                                {t("pages.admin.users.form.username")}
                            </Label>
                            <Input
                                id="edit-username"
                                value={editUsername}
                                onChange={(e) =>
                                    setEditUsername(e.target.value)
                                }
                                placeholder={t(
                                    "pages.admin.users.form.usernamePlaceholder",
                                )}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-password">
                                {t("pages.admin.users.form.password")}
                            </Label>
                            <Input
                                id="edit-password"
                                type="password"
                                value={editPassword}
                                onChange={(e) =>
                                    setEditPassword(e.target.value)
                                }
                                placeholder={t(
                                    "pages.admin.users.form.passwordPlaceholderOptional",
                                )}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-role">
                                {t("pages.admin.users.form.role")}
                            </Label>
                            <Select
                                value={editRole}
                                onValueChange={setEditRole}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">
                                        {t("pages.admin.users.roleUser")}
                                    </SelectItem>
                                    <SelectItem value="admin">
                                        {t("pages.admin.users.roleAdmin")}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="edit-isActive"
                                checked={editIsActive}
                                onCheckedChange={setEditIsActive}
                            />
                            <Label htmlFor="edit-isActive">
                                {t("pages.admin.users.form.isActive")}
                            </Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowEditDialog(false)}
                        >
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleEditUser} disabled={isEditing}>
                            {isEditing
                                ? t("common.loading")
                                : t("common.actions.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* User Conversations Dialog */}
            <Dialog
                open={showConversationsDialog}
                onOpenChange={setShowConversationsDialog}
            >
                <DialogContent className="sm:max-w-150">
                    <DialogHeader>
                        <DialogTitle>
                            {selectedUserForConversations?.username} -{" "}
                            {t(
                                "pages.admin.users.conversations",
                                "Conversations",
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    <ScrollArea className="h-100 w-full rounded-md">
                        {isLoadingConversations ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-muted-foreground">
                                    {t("common.loading")}
                                </div>
                            </div>
                        ) : userConversations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                                <MessageSquare className="size-8 opacity-20" />
                                <p>
                                    {t(
                                        "common.noData",
                                        "No conversations found",
                                    )}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {userConversations.map((conv) => (
                                    <div
                                        key={conv.id}
                                        className="flex items-center gap-3 p-3 rounded-lg border bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                                        onClick={() =>
                                            window.open(
                                                `/chat/${conv.id}`,
                                                "_blank",
                                            )
                                        }
                                    >
                                        <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-background">
                                            <span className="text-lg">
                                                {conv.icon || "💬"}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">
                                                {conv.title}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatDate(conv.updated_at)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={!!userToDelete}
                onOpenChange={(open) => !open && setUserToDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("pages.admin.users.deleteTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("pages.admin.users.deleteDescription")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t("common.actions.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() =>
                                userToDelete && handleDeleteUser(userToDelete)
                            }
                        >
                            {t("common.actions.confirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
