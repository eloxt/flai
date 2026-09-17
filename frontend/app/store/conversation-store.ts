import { useAuthStore } from "./auth-store";
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
        const sessionVersion = useAuthStore.getState().sessionVersion;
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
            if (sessionVersion !== useAuthStore.getState().sessionVersion) return;
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error(t("error.network"));
            }
        } finally {
            if (sessionVersion !== useAuthStore.getState().sessionVersion) return;
            set({ isLoading: false });
        }
    },
    fetchFavourites: async () => {
        const sessionVersion = useAuthStore.getState().sessionVersion;
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
            if (sessionVersion !== useAuthStore.getState().sessionVersion) return;
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error(t("error.network"));
            }
        } finally {
            if (sessionVersion !== useAuthStore.getState().sessionVersion) return;
            set({ isLoadingFavourites: false });
        }
    },
    fetchMoreConversations: async () => {
        const sessionVersion = useAuthStore.getState().sessionVersion;
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
            if (sessionVersion !== useAuthStore.getState().sessionVersion) return;
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error(t("error.network"));
            }
        } finally {
            if (sessionVersion !== useAuthStore.getState().sessionVersion) return;
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
        const sessionVersion = useAuthStore.getState().sessionVersion;
        set((state) => ({
            conversations: state.conversations.map(c => c.id === id ? { ...c, generating: true } : c),
            favouriteConversations: state.favouriteConversations.map(c => c.id === id ? { ...c, generating: true } : c),
        }));
        try {
            const result = await api.post<GenerateTitleResponse>(`/api/conversation/${id}/generate-title`, { content });
            set((state) => ({
                conversations: state.conversations.map(c => c.id === id ? { ...c, ...result } : c),
                favouriteConversations: state.favouriteConversations.map(c => c.id === id ? { ...c, ...result } : c),
            }));
        } catch (error) {
            if (sessionVersion !== useAuthStore.getState().sessionVersion) return;
            toast.error(error instanceof Error ? error.message : t("error.network"));
        } finally {
            if (sessionVersion === useAuthStore.getState().sessionVersion) {
                set((state) => ({
                    conversations: state.conversations.map(c => c.id === id ? { ...c, generating: false } : c),
                    favouriteConversations: state.favouriteConversations.map(c => c.id === id ? { ...c, generating: false } : c),
                }));
            }
        }
    },
    deleteConversation: async (id: string) => {
        const sessionVersion = useAuthStore.getState().sessionVersion;
        try {
            await api.del(`/api/conversation/${id}`);
            toast.success(t("common.success.deleted"))
        } catch (error) {
            if (sessionVersion !== useAuthStore.getState().sessionVersion) return;
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error(t("error.network"));
            }
            return;
        }
        set((state) => ({
            conversations: state.conversations.filter((c) => c.id !== id),
            favouriteConversations: state.favouriteConversations.filter((c) => c.id !== id),
        }));
    },
    toggleFavourite: async (id: string, isFavourite: boolean) => {
        const sessionVersion = useAuthStore.getState().sessionVersion;
        try {
            if (isFavourite) await api.del(`/api/conversation/${id}/favourite`);
            else await api.post(`/api/conversation/${id}/favourite`);
            set((state) => {
                const source = [...state.conversations, ...state.favouriteConversations].find(c => c.id === id);
                const conversations = state.conversations.filter(c => c.id !== id);
                const favourites = state.favouriteConversations.filter(c => c.id !== id);
                if (source) {
                    if (isFavourite) conversations.push({ ...source, favourite: 0 });
                    else favourites.unshift({ ...source, favourite: 1 });
                }
                conversations.sort((a, b) => b.created_at.localeCompare(a.created_at));
                return { conversations, favouriteConversations: favourites };
            });
            // Moving a record changes page boundaries; reload the first page before loading more.
            await get().fetchConversations();
        } catch (error) {
            if (sessionVersion !== useAuthStore.getState().sessionVersion) return;
            toast.error(error instanceof Error ? error.message : t("error.network"));
        }
    },
}));
