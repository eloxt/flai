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
    favourite: number;
}

interface GenerateTitleResponse {
    title: string;
    icon: string;
}

const PAGE_SIZE = 20;

interface ConversationState {
    conversations: Conversation[];
    favouriteConversations: Conversation[];
    isLoading: boolean;
    isLoadingFavourites: boolean;
    isLoadingMore: boolean;
    currentPage: number;
    hasMore: boolean;
    fetchConversations: () => Promise<void>;
    fetchFavourites: () => Promise<void>;
    fetchMoreConversations: () => Promise<void>;
    addConversation: (id: string) => void;
    generateTitle: (id: string, content?: string) => Promise<void>;
    deleteConversation: (id: string) => Promise<void>;
    toggleFavourite: (id: string, isFavourite: boolean) => Promise<void>;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
    conversations: [],
    favouriteConversations: [],
    isLoading: false,
    isLoadingFavourites: false,
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
            const favouriteIds = new Set(get().favouriteConversations.map((c) => c.id));
            const records = response.records.map((record) => ({
                ...record,
                favourite: favouriteIds.has(record.id) ? 1 : record.favourite ?? 0,
            }));
            set({ conversations: records, currentPage: 1, hasMore });
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
    fetchFavourites: async () => {
        set({ isLoadingFavourites: true });
        try {
            const response = await api.get<Conversation[]>("/api/conversation/favourite");
            const favouriteIds = new Set(response.map((c) => c.id));
            set((state) => ({
                favouriteConversations: response.map((record) => ({
                    ...record,
                    favourite: 1,
                })),
                conversations: state.conversations.map((record) => ({
                    ...record,
                    favourite: favouriteIds.has(record.id) ? 1 : record.favourite ?? 0,
                })),
            }));
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error(t("error.network"));
            }
        } finally {
            set({ isLoadingFavourites: false });
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
            const favouriteIds = new Set(get().favouriteConversations.map((c) => c.id));
            const newConversations = response.records
                .filter(c => !existingIds.has(c.id))
                .map((record) => ({
                    ...record,
                    favourite: favouriteIds.has(record.id) ? 1 : record.favourite ?? 0,
                }));
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
            favourite: 0,
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
            favouriteConversations: state.favouriteConversations.filter((c) => c.id !== id),
        }));
    },
    toggleFavourite: async (id: string, isFavourite: boolean) => {
        try {
            if (isFavourite) {
                await api.del(`/api/conversation/${id}/favourite`);
            } else {
                await api.post(`/api/conversation/${id}/favourite`);
            }
            const nextFavourite = isFavourite ? 0 : 1;
            set((state) => {
                const updatedConversations = state.conversations.map((record) =>
                    record.id === id ? { ...record, favourite: nextFavourite, updated_at: new Date().toISOString() } : record
                );
                const existingFavourite = state.favouriteConversations.find((record) => record.id === id);
                const sourceConversation = state.conversations.find((record) => record.id === id) || existingFavourite;
                let updatedFavourites = state.favouriteConversations;
                if (nextFavourite === 1) {
                    if (sourceConversation) {
                        updatedFavourites = [
                            { ...sourceConversation, favourite: 1 },
                            ...state.favouriteConversations.filter((record) => record.id !== id),
                        ];
                    }
                } else {
                    updatedFavourites = state.favouriteConversations.filter((record) => record.id !== id);
                }
                return {
                    conversations: updatedConversations,
                    favouriteConversations: updatedFavourites,
                };
            });
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error(t("error.network"));
            }
        }
    },
}));
