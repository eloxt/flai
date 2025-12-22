import { create } from "zustand";
import { api, ApiError, ApiPageResponse } from "@/lib/api";
import { toast } from "sonner";
import { t } from "i18next";

export interface Conversation {
    id: string;
    title: string;
    icon: string;
    generating: boolean;
    created_at: string;
    updated_at: string;
}

interface GenerateTitleResponse {
    title: string;
    icon: string;
}

interface ConversationState {
    conversations: Conversation[];
    isLoading: boolean;
    fetchConversations: () => Promise<void>;
    addConversation: (id: string) => void;
    generateTitle: (id: string) => Promise<void>;
    deleteConversation: (id: string) => Promise<void>;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
    conversations: [],
    isLoading: false,
    fetchConversations: async () => {
        set({ isLoading: true });
        try {
            const response = await api.get<ApiPageResponse<Conversation>>("/api/conversation");
            set({ conversations: response.records });
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error(t("error.network"));
            }
        } finally {
            set({ isLoading: false });
        }
    },
    addConversation: (id: string) => {
        if (!id) return;
        const newConversation: Conversation = {
            id,
            title: "New Conversation",
            icon: "",
            generating: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        set((state) => ({ conversations: [newConversation, ...state.conversations] }));
        get().generateTitle(id);
    },
    generateTitle: async (id: string) => {
        try {
            set((state) => ({
                conversations: state.conversations.map((c) =>
                    c.id === id ? { ...c, generating: true } : c
                ),
            }));
            const result = await api.get<GenerateTitleResponse>(`/api/conversation/${id}/generate-title`);
            set((state) => ({
                conversations: state.conversations.map((c) =>
                    c.id === id ? { ...c, title: result.title, icon: result.icon, generating: false } : c
                ),
            }));
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error(t("error.network"));
            }
        }
    },
    deleteConversation: async (id: string) => {
        try {
            await api.del(`/api/conversation/${id}`);
            toast.success(t("success.conversationDeleted"))
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error(t("error.network"));
            }
        }
        set((state) => ({
            conversations: state.conversations.filter((c) => c.id !== id),
        }));
    },
}));
