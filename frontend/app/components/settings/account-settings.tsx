import { useState, useEffect } from "react";
import { User, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AccountSettings() {
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
