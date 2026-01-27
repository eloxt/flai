import { useState, useEffect } from "react";
import { Share2, Trash2, RefreshCw, ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ShareItem {
    id: string;
    conversation_title: string;
    created_at: string;
    expires_at: string;
}

export function ShareSettings() {
    const { t } = useTranslation();
    const [shares, setShares] = useState<ShareItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingShare, setEditingShare] = useState<ShareItem | null>(null);
    const [newExpiresAt, setNewExpiresAt] = useState("");
    const [isUpdating, setIsUpdating] = useState(false);
    const [shareToDelete, setShareToDelete] = useState<string | null>(null);

    const fetchShares = async () => {
        setIsLoading(true);
        try {
            const result = await api.get<ShareItem[]>("/api/share");
            setShares(result || []);
        } catch (error: any) {
            toast.error(error.message || t("common.crud.fetchError"));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchShares();
    }, []);

    const handleDelete = async (id: string) => {
        try {
            await api.del(`/api/share/${id}`);
            toast.success(t("common.crud.deleteSuccess"));
            fetchShares();
        } catch (error: any) {
            toast.error(error.message || t("common.crud.deleteError"));
        } finally {
            setShareToDelete(null);
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
            toast.success(t("common.crud.updateSuccess"));
            setIsEditDialogOpen(false);
            fetchShares();
        } catch (error: any) {
            toast.error(error.message || t("common.crud.updateError"));
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
                    {t("common.empty.noItems")}
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
                                            onClick={() => setShareToDelete(share.id)}
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

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!shareToDelete} onOpenChange={(open) => !open && setShareToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("pages.settings.share.title")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("common.dialog.confirmDelete")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.actions.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => shareToDelete && handleDelete(shareToDelete)}>
                            {t("common.actions.confirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
