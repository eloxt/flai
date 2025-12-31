import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Loader2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";

interface ShareDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversationId: string;
}

interface CreateShareResponse {
    id: string;
}

interface CheckShareResponse {
    exists: boolean;
    id?: string;
}

export default function ShareDialog({ open, onOpenChange, conversationId }: ShareDialogProps) {
    const { t } = useTranslation();
    const [expiresAt, setExpiresAt] = useState<string>("7d");
    const [isLoading, setIsLoading] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [existingShareId, setExistingShareId] = useState<string | null>(null);

    const expirationOptions = [
        { value: "1h", label: t("components.share.expiration.1hour") },
        { value: "1d", label: t("components.share.expiration.1day") },
        { value: "7d", label: t("components.share.expiration.7days") },
        { value: "30d", label: t("components.share.expiration.30days") },
        { value: "never", label: t("components.share.expiration.never") },
    ];

    // Check if share already exists when dialog opens
    useEffect(() => {
        if (open && conversationId) {
            checkExistingShare();
        }
    }, [open, conversationId]);

    const checkExistingShare = async () => {
        setIsChecking(true);
        try {
            const response = await api.get<CheckShareResponse>(`/api/share/${conversationId}/check`);
            if (response.exists && response.id) {
                setExistingShareId(response.id);
                const url = `${window.location.origin}/public/share/${response.id}`;
                setShareUrl(url);
            }
        } catch {
            setExistingShareId(null);
        } finally {
            setIsChecking(false);
        }
    };

    const calculateExpiresAt = (value: string): string => {
        if (value === "never") return "";

        const now = new Date();
        switch (value) {
            case "1h":
                now.setHours(now.getHours() + 1);
                break;
            case "1d":
                now.setDate(now.getDate() + 1);
                break;
            case "7d":
                now.setDate(now.getDate() + 7);
                break;
            case "30d":
                now.setDate(now.getDate() + 30);
                break;
        }
        return now.toISOString();
    };

    const handleCreateOrUpdateShare = async () => {
        setIsLoading(true);
        try {
            if (existingShareId) {
                // Update existing share
                await api.put(`/api/share/${existingShareId}`, {
                    expires_at: calculateExpiresAt(expiresAt),
                });
                toast.success(t("components.share.updateSuccess"));
            } else {
                // Create new share
                const response = await api.post<CreateShareResponse>("/api/share", {
                    conversation_id: conversationId,
                    expires_at: calculateExpiresAt(expiresAt),
                });
                setExistingShareId(response.id);
                const url = `${window.location.origin}/public/share/${response.id}`;
                setShareUrl(url);
                toast.success(t("components.share.success"));
            }
        } catch {
            toast.error(existingShareId ? t("components.share.updateError") : t("components.share.error"));
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = async () => {
        if (shareUrl) {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            toast.success(t("components.share.copied"));
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            // Reset state when closing
            setShareUrl(null);
            setExpiresAt("7d");
            setCopied(false);
            setExistingShareId(null);
        }
        onOpenChange(open);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("components.share.title")}</DialogTitle>
                    <DialogDescription>
                        {existingShareId
                            ? t("components.share.updateDescription")
                            : t("components.share.description")}
                    </DialogDescription>
                </DialogHeader>

                {isChecking ? (
                    <div className="flex items-center justify-center py-8">
                        <Spinner className="size-6" />
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col gap-4 py-4">
                            {shareUrl && (
                                <div className="flex flex-col gap-2">
                                    <Label>{t("components.share.linkLabel")}</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            value={shareUrl}
                                            readOnly
                                            className="flex-1"
                                        />
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={handleCopy}
                                        >
                                            {copied ? (
                                                <Check className="size-4" />
                                            ) : (
                                                <Copy className="size-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="expiration">
                                    {t("components.share.expirationLabel")}
                                </Label>
                                <Select value={expiresAt} onValueChange={setExpiresAt}>
                                    <SelectTrigger id="expiration" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {expirationOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => handleOpenChange(false)}>
                                {t("common.actions.cancel")}
                            </Button>
                            <Button
                                onClick={handleCreateOrUpdateShare}
                                disabled={isLoading}
                            >
                                {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                                {existingShareId
                                    ? t("components.share.updateButton")
                                    : t("components.share.createButton")}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
