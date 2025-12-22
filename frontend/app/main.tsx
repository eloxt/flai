import { ChatInput } from "@/components/chat-input";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useModelStore } from "./store/model-store";
import { useInputStore } from "./store/input-store";
import { api } from "./lib/api";
import { toast } from "sonner";


export default function Main() {
    const { t } = useTranslation();
    const { currentModel } = useModelStore();
    const navigate = useNavigate();
    const inputValue = useInputStore((state) => state.mainInput);
    const setInputValue = useInputStore((state) => state.setMainInput);
    const [isLoading, setIsLoading] = useState(false);
    const setSendMainInput = useInputStore((state) => state.setSendMainInput);

    const handleSend = async () => {
        if (!inputValue.trim()) return;
        if (!currentModel || !currentModel.provider_id) {
            toast.error("Please select a model first");
            return;
        }

        setIsLoading(true);
        try {
            const conversationRes = await api.post<{ id: string }>("/api/conversation", {});
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

    return (
        <div className="flex h-full flex-col items-center justify-center gap-12 px-4">
            <p className="font-medium text-3xl">
                {t("greeting")}
            </p>

            <ChatInput
                className="max-w-3xl"
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSend}
                isLoading={isLoading}
                placeholder={t("placeholder")}
            />
        </div>
    );
}
