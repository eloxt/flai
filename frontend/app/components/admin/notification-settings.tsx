import { useState, useEffect } from "react";
import { Bell, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Notification } from "@/types/shared";

export function NotificationSettings() {
    const { t } = useTranslation();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editingNotification, setEditingNotification] = useState<Notification | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [notificationToDelete, setNotificationToDelete] = useState<string | null>(null);

    // Form state
    const [formTitle, setFormTitle] = useState("");
    const [formContent, setFormContent] = useState("");
    const [formLevel, setFormLevel] = useState("default");

    const fetchNotifications = async () => {
        setIsLoading(true);
        try {
            const result = await api.get<{ list: Notification[] }>("/admin/notification");
            setNotifications(result.list || []);
        } catch (error: any) {
            toast.error(error.message || t("common.crud.fetchError"));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const resetForm = () => {
        setFormTitle("");
        setFormContent("");
        setFormLevel("default");
    };

    const openCreateDialog = () => {
        resetForm();
        setShowCreateDialog(true);
    };

    const openEditDialog = (notification: Notification) => {
        setEditingNotification(notification);
        setFormTitle(notification.title);
        setFormContent(notification.content);
        setFormLevel(notification.level || "default");
        setShowEditDialog(true);
    };

    const handleCreate = async () => {
        if (!formTitle || !formContent) {
            toast.error(t("pages.admin.notification.fillRequired"));
            return;
        }

        setIsSaving(true);
        try {
            await api.post("/admin/notification", {
                title: formTitle,
                content: formContent,
                level: formLevel,
            });
            toast.success(t("common.crud.createSuccess"));
            setShowCreateDialog(false);
            resetForm();
            fetchNotifications();
        } catch (error: any) {
            toast.error(error.message || t("pages.admin.notification.saveError"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleEdit = async () => {
        if (!editingNotification || !formTitle || !formContent) {
            toast.error(t("pages.admin.notification.fillRequired"));
            return;
        }

        setIsSaving(true);
        try {
            await api.put(`/admin/notification/${editingNotification.id}`, {
                title: formTitle,
                content: formContent,
                level: formLevel,
            });
            toast.success(t("common.crud.updateSuccess"));
            setShowEditDialog(false);
            setEditingNotification(null);
            resetForm();
            fetchNotifications();
        } catch (error: any) {
            toast.error(error.message || t("pages.admin.notification.saveError"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.del(`/admin/notification/${id}`);
            toast.success(t("common.crud.deleteSuccess"));
            fetchNotifications();
        } catch (error: any) {
            toast.error(error.message || t("common.crud.deleteError"));
        } finally {
            setNotificationToDelete(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-medium flex items-center gap-2">
                        <Bell className="size-5" />
                        {t("pages.admin.notification.title")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {t("pages.admin.notification.description")}
                    </p>
                </div>
                <Button onClick={openCreateDialog}>
                    <Plus className="size-4 mr-2" />
                    {t("pages.admin.notification.add")}
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
                                <TableHead>{t("pages.admin.notification.titleLabel")}</TableHead>
                                <TableHead>{t("pages.admin.notification.contentLabel")}</TableHead>
                                <TableHead>{t("pages.admin.notification.levelLabel")}</TableHead>
                                <TableHead className="w-[120px]">{t("pages.admin.users.table.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {notifications.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                        {t("common.empty.noItems")}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                notifications.map((notification) => (
                                    <TableRow key={notification.id}>
                                        <TableCell className="font-medium">{notification.title}</TableCell>
                                        <TableCell className="max-w-xs truncate">{notification.content}</TableCell>
                                        <TableCell>
                                            <Badge variant={notification.level === "warning" ? "destructive" : "default"}>
                                                {notification.level === "warning"
                                                    ? t("pages.admin.notification.levelWarning")
                                                    : t("pages.admin.notification.levelDefault")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openEditDialog(notification)}
                                                >
                                                    <Pencil className="size-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setNotificationToDelete(notification.id)}
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

            {/* Create Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("pages.admin.notification.addTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="create-title">{t("pages.admin.notification.titleLabel")}</Label>
                            <Input
                                id="create-title"
                                value={formTitle}
                                onChange={(e) => setFormTitle(e.target.value)}
                                placeholder={t("pages.admin.notification.titlePlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="create-content">{t("pages.admin.notification.contentLabel")}</Label>
                            <Textarea
                                id="create-content"
                                value={formContent}
                                onChange={(e) => setFormContent(e.target.value)}
                                placeholder={t("pages.admin.notification.contentPlaceholder")}
                                className="h-24"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="create-level">{t("pages.admin.notification.levelLabel")}</Label>
                            <Select value={formLevel} onValueChange={setFormLevel}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">{t("pages.admin.notification.levelDefault")}</SelectItem>
                                    <SelectItem value="warning">{t("pages.admin.notification.levelWarning")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleCreate} disabled={isSaving}>
                            {isSaving ? t("common.loading") : t("common.actions.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("pages.admin.notification.editTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-title">{t("pages.admin.notification.titleLabel")}</Label>
                            <Input
                                id="edit-title"
                                value={formTitle}
                                onChange={(e) => setFormTitle(e.target.value)}
                                placeholder={t("pages.admin.notification.titlePlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-content">{t("pages.admin.notification.contentLabel")}</Label>
                            <Textarea
                                id="edit-content"
                                value={formContent}
                                onChange={(e) => setFormContent(e.target.value)}
                                placeholder={t("pages.admin.notification.contentPlaceholder")}
                                className="h-24"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-level">{t("pages.admin.notification.levelLabel")}</Label>
                            <Select value={formLevel} onValueChange={setFormLevel}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">{t("pages.admin.notification.levelDefault")}</SelectItem>
                                    <SelectItem value="warning">{t("pages.admin.notification.levelWarning")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleEdit} disabled={isSaving}>
                            {isSaving ? t("common.loading") : t("common.actions.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!notificationToDelete} onOpenChange={(open) => !open && setNotificationToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("pages.admin.notification.deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("common.dialog.confirmDelete")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.actions.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => notificationToDelete && handleDelete(notificationToDelete)}>
                            {t("common.actions.confirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
