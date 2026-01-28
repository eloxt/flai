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

const PAGE_SIZE = 20;

interface ConversationState {
    conversations: Conversation[];
    isLoading: boolean;
    isLoadingMore: boolean;
    currentPage: number;
    hasMore: boolean;
    fetchConversations: () => Promise<void>;
    fetchMoreConversations: () => Promise<void>;
    addConversation: (id: string) => void;
    generateTitle: (id: string, content?: string) => Promise<void>;
    deleteConversation: (id: string) => Promise<void>;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
    conversations: [],
    isLoading: false,
    isLoadingMore: false,
    currentPage: 1,
    hasMore: true,
    fetchConversations: async () => {
        set({ isLoading: true, currentPage: 1, hasMore: true });
        try {
            const response = await api.get<ApiPageResponse<Conversation>>("/api/conversation", {
                current: 1,
                size: PAGE_SIZE,
            });
            const hasMore = response.current * response.size < response.total;
            set({ conversations: response.records, currentPage: 1, hasMore });
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
    fetchMoreConversations: async () => {
        const { isLoadingMore, hasMore, currentPage, conversations } = get();
        if (isLoadingMore || !hasMore) return;

        set({ isLoadingMore: true });
        try {
            const nextPage = currentPage + 1;
            const response = await api.get<ApiPageResponse<Conversation>>("/api/conversation", {
                current: nextPage,
                size: PAGE_SIZE,
            });
            const newHasMore = response.current * response.size < response.total;
            // Filter out duplicates (in case a new conversation was added)
            const existingIds = new Set(conversations.map(c => c.id));
            const newConversations = response.records.filter(c => !existingIds.has(c.id));
            set({
                conversations: [...conversations, ...newConversations],
                currentPage: nextPage,
                hasMore: newHasMore,
            });
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error(t("error.network"));
            }
        } finally {
            set({ isLoadingMore: false });
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
    },
    generateTitle: async (id: string, content?: string) => {
        try {
            set((state) => ({
                conversations: state.conversations.map((c) =>
                    c.id === id ? { ...c, generating: true } : c
                ),
            }));
            const result = await api.post<GenerateTitleResponse>(`/api/conversation/${id}/generate-title`, {
                content,
            });
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
            toast.success(t("common.success.deleted"))
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
