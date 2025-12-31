import { useState } from "react";
import ModelSelector from "./model-selector";
import { useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { MessageSquareShare } from "lucide-react";
import { useTranslation } from "react-i18next";
import ShareDialog from "./share-dialog";
import { useAppStore } from "@/store/app-store";

export default function ChatHeader() {
    const { t } = useTranslation();
    const location = useLocation();
    const [showShareDialog, setShowShareDialog] = useState(false);
    const showHeaderBorder = useAppStore((state) => state.showHeaderBorder);

    const conversationId = location.pathname.startsWith("/chat/")
        ? location.pathname.split("/chat/")[1]
        : "";

    return (
        <>
            <header className={`sticky top-0 z-50 bg-background flex items-center justify-between px-4 py-2 gap-2 transition-[border-color] duration-200 ${showHeaderBorder ? "border-b border-border" : "border-b border-transparent"}`}>
                <ModelSelector />
                {location.pathname.startsWith("/chat/") && (
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            title={t("common.shareConversation")}
                            onClick={() => setShowShareDialog(true)}
                        >
                            <MessageSquareShare />
                        </Button>
                    </div>
                )}
            </header>

            <ShareDialog
                open={showShareDialog}
                onOpenChange={setShowShareDialog}
                conversationId={conversationId}
            />
        </>
    );
}