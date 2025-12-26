import { useState, useEffect } from "react";
import { User, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function SettingsPanel() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState("account");

    const tabs = [
        { id: "account", label: t("settingsPage.tabs.account"), icon: <User className="size-4" /> },
    ];

    return (
        <div className="flex h-full w-full bg-background text-foreground">
            {/* Left Sidebar */}
            <aside className="w-64 flex-shrink-0 border-r bg-muted/30">
                <div className="p-4 pt-6">
                    <h2 className="text-lg font-semibold tracking-tight px-2 mb-4">{t("settingsPage.title")}</h2>
                    <nav className="flex flex-col gap-1">
                        {tabs.map((tab) => (
                            <Button
                                key={tab.id}
                                variant={activeTab === tab.id ? "secondary" : "ghost"}
                                className={cn(
                                    "justify-start gap-3 h-10 px-3 font-normal",
                                    activeTab === tab.id && "bg-secondary font-medium"
                                )}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.icon}
                                {tab.label}
                            </Button>
                        ))}
                    </nav>
                </div>
            </aside>

            {/* Right Content */}
            <main className="flex-1 min-w-0">
                <ScrollArea className="h-[85vh]">
                    <div className="p-6 max-w-2xl space-y-8 pb-32">
                        {activeTab === "account" && <AccountSettings />}
                    </div>
                </ScrollArea>
            </main>
        </div>
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

    const handleUpdateProfile = async () => {
        if (!username) {
            toast.error(t("settingsPage.account.usernameRequired"));
            return;
        }

        setIsLoading(true);
        try {
            await api.put("/api/user", {
                username,
                avatar,
            });
            updateUser({ username, avatar });
            toast.success(t("settingsPage.account.success"));
        } catch (error: any) {
            toast.error(error.message || t("settingsPage.account.error"));
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!oldPassword || !newPassword) {
            toast.error(t("settingsPage.security.fillAll"));
            return;
        }

        setIsPasswordLoading(true);
        try {
            await api.put("/api/user/password", {
                old_password: oldPassword,
                password: newPassword,
            });
            toast.success(t("settingsPage.security.success"));
            setOldPassword("");
            setNewPassword("");
        } catch (error: any) {
            toast.error(error.message || t("settingsPage.security.error"));
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
                        {t("settingsPage.account.title")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {t("settingsPage.account.description")}
                    </p>
                </div>
                <Separator />

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="username">{t("settingsPage.account.username")}</Label>
                        <Input
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder={t("settingsPage.account.usernamePlaceholder")}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="avatar">{t("settingsPage.account.avatar")}</Label>
                        <Input
                            id="avatar"
                            value={avatar}
                            onChange={(e) => setAvatar(e.target.value)}
                            placeholder={t("settingsPage.account.avatarPlaceholder")}
                        />
                    </div>
                    <Button
                        onClick={handleUpdateProfile}
                        disabled={isLoading}
                        className="w-fit"
                    >
                        {isLoading ? t("settingsPage.account.saving") : t("settingsPage.account.save")}
                    </Button>
                </div>
            </div>

            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-medium flex items-center gap-2">
                        <Lock className="size-5" />
                        {t("settingsPage.security.title")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {t("settingsPage.security.description")}
                    </p>
                </div>
                <Separator />

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="old-password">{t("settingsPage.security.currentPassword")}</Label>
                        <Input
                            id="old-password"
                            type="password"
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            placeholder={t("settingsPage.security.currentPasswordPlaceholder")}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="new-password">{t("settingsPage.security.newPassword")}</Label>
                        <Input
                            id="new-password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={t("settingsPage.security.newPasswordPlaceholder")}
                        />
                    </div>
                    <Button
                        onClick={handleUpdatePassword}
                        disabled={isPasswordLoading}
                        variant="secondary"
                        className="w-fit"
                    >
                        {isPasswordLoading ? t("settingsPage.security.updating") : t("settingsPage.security.update")}
                    </Button>
                </div>
            </div>
        </div>
    );
}
