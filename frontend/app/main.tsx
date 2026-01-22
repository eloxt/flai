import { ChatInput } from "@/components/chat-input";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useModelStore } from "./store/model-store";
import { useInputStore } from "./store/input-store";
import { api } from "./lib/api";
import { toast } from "sonner";
import { useAppStore } from "./store/app-store";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./components/ui/alert";
import { AlertTriangleIcon, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Notification {
    id: string;
    title: string;
    content: string;
    level: string;
}

export default function Main() {
    const { t } = useTranslation();
    const { currentModel } = useModelStore();
    const navigate = useNavigate();
    const inputValue = useInputStore((state) => state.mainInput);
    const setInputValue = useInputStore((state) => state.setMainInput);
    const [isLoading, setIsLoading] = useState(false);
    const setSendMainInput = useInputStore((state) => state.setSendMainInput);
    const toggleInspectionPanel = useAppStore(
        (state) => state.toggleInspectionPanel,
    );
    const isInspectionPanelOpen = useAppStore(
        (state) => state.isInspectionPanelOpen,
    );
    const setCurrentMessagePath = useAppStore(
        (state) => state.setCurrentMessagePath,
    );
    const setShowHeaderBorder = useAppStore(
        (state) => state.setShowHeaderBorder,
    );
    const dismissedNotifications = useAppStore(
        (state) => state.dismissedNotifications,
    );
    const dismissNotification = useAppStore(
        (state) => state.dismissNotification,
    );

    const [notifications, setNotifications] = useState<Notification[]>([]);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await api.get<{ list: Notification[] }>("/api/notification");
            setNotifications(res.list || []);
        } catch (error) {
            console.error("Failed to fetch notifications:", error);
        }
    }, []);

    const handleSend = async () => {
        if (!inputValue.trim()) return;
        if (!currentModel || !currentModel.provider_id) {
            toast.error("Please select a model first");
            return;
        }

        setIsLoading(true);
        try {
            const conversationRes = await api.post<{ id: string }>(
                "/api/conversation",
                {},
            );
            const conversationId = conversationRes.id;
            setSendMainInput(true);
            navigate(`/chat/${conversationId}`);
        } catch (error) {
            console.error("Failed to send message:", error);
            if (error instanceof Error) {
                toast.error(error.message);
            } else {
                toast.error("Failed to start conversation");
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isInspectionPanelOpen) {
            toggleInspectionPanel();
        }
        setCurrentMessagePath([]);
        setShowHeaderBorder(false);
        fetchNotifications();
    }, []);

    const visibleNotifications = notifications.filter(
        (n) => !dismissedNotifications.includes(n.id)
    );

    return (
        <div className="relative flex h-full flex-col">
            {visibleNotifications.length > 0 && (
                <div className="absolute left-0 right-0 top-4 z-10 flex flex-col items-center gap-1 px-4 md:px-2">
                    {visibleNotifications.map((notification) => (
                        <Alert
                            key={notification.id}
                            className={
                                notification.level === "warning"
                                    ? "max-w-3xl border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50"
                                    : "max-w-3xl"
                            }
                        >
                            {notification.level === "warning" ? (
                                <AlertTriangleIcon />
                            ) : (
                                <Info />
                            )}
                            <AlertTitle>{notification.title}</AlertTitle>
                            <AlertDescription>
                                {notification.content}
                            </AlertDescription>
                            <AlertAction>
                                <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    className={
                                        notification.level === "warning"
                                            ? "hover:bg-amber-100 dark:hover:bg-amber-900"
                                            : ""
                                    }
                                    onClick={() => dismissNotification(notification.id)}
                                >
                                    <X />
                                </Button>
                            </AlertAction>
                        </Alert>
                    ))}
                </div>
            )}

            <div className="flex flex-1 flex-col items-center justify-center gap-12 px-4">
                <p className="font-medium text-3xl">{t("pages.chat.greeting")}</p>
                <ChatInput
                    className="max-w-3xl"
                    value={inputValue}
                    onChange={setInputValue}
                    onSend={handleSend}
                    isLoading={isLoading}
                    autoFocus
                />
            </div>
        </div>
    );
}
