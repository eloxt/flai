import type { Conversation, Page } from "@flai/shared"
import { create } from "zustand"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"
import { onSessionChange, useAuthStore } from "./auth-store"

const PAGE_SIZE = 20

export interface ConversationItem extends Conversation {
  /** Title generation in progress. */
  generating?: boolean
}

interface ConversationState {
  conversations: ConversationItem[]
  favourites: ConversationItem[]
  /** Conversation id → assistant message id, including replies running in the background. */
  replying: Record<string, string>
  nextCursor: string | null
  loading: boolean
  loadingMore: boolean
  loaded: boolean
  load: () => Promise<void>
  loadMore: () => Promise<void>
  /** Insert a just-created conversation at the top of the list. */
  add: (conversation: Conversation) => void
  patchLocal: (id: string, patch: Partial<ConversationItem>) => void
  generateTitle: (id: string, content?: string) => Promise<void>
  remove: (id: string) => Promise<void>
  setFavourite: (id: string, favourite: boolean) => Promise<void>
}

const initial = {
  conversations: [],
  favourites: [],
  replying: {} as Record<string, string>,
  nextCursor: null,
  loading: false,
  loadingMore: false,
  loaded: false,
}

/** Run `fn` and drop its result if the user logged out or switched accounts meanwhile. */
async function guarded<T>(fn: () => Promise<T>): Promise<T | undefined> {
  const version = useAuthStore.getState().sessionVersion
  try {
    const result = await fn()
    return useAuthStore.getState().sessionVersion === version ? result : undefined
  } catch (error) {
    if (useAuthStore.getState().sessionVersion === version) notify.error(error)
    return undefined
  }
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  ...initial,
  load: async () => {
    set({ loading: true })
    const result = await guarded(() =>
      Promise.all([
        api<Page<Conversation>>("/conversations", { query: { favourite: false, limit: PAGE_SIZE } }),
        api<Page<Conversation>>("/conversations", { query: { favourite: true, limit: 100 } }),
      ])
    )
    if (result) {
      const [page, favs] = result
      set({ conversations: page.items, nextCursor: page.nextCursor, favourites: favs.items, loaded: true })
    }
    set({ loading: false })
  },
  loadMore: async () => {
    const { nextCursor, loadingMore } = get()
    if (!nextCursor || loadingMore) return
    set({ loadingMore: true })
    const page = await guarded(() =>
      api<Page<Conversation>>("/conversations", { query: { favourite: false, limit: PAGE_SIZE, cursor: nextCursor } })
    )
    if (page) {
      const known = new Set(get().conversations.map((c) => c.id))
      set((s) => ({
        conversations: [...s.conversations, ...page.items.filter((c) => !known.has(c.id))],
        nextCursor: page.nextCursor,
      }))
    }
    set({ loadingMore: false })
  },
  add: (conversation) =>
    set((s) => ({ conversations: [conversation, ...s.conversations.filter((c) => c.id !== conversation.id)] })),
  patchLocal: (id, patch) =>
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      favourites: s.favourites.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  generateTitle: async (id, content) => {
    get().patchLocal(id, { generating: true })
    const updated = await guarded(() => api<Conversation>(`/conversations/${id}/title`, { method: "POST", body: { content } }))
    get().patchLocal(id, { ...(updated ?? {}), generating: false })
  },
  remove: async (id) => {
    const ok = await guarded(() => api(`/conversations/${id}`, { method: "DELETE" }).then(() => true))
    if (!ok) return
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      favourites: s.favourites.filter((c) => c.id !== id),
    }))
  },
  setFavourite: async (id, favourite) => {
    const updated = await guarded(() => api<Conversation>(`/conversations/${id}`, { method: "PATCH", body: { favourite } }))
    if (!updated) return
    set((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id)
      const favourites = s.favourites.filter((c) => c.id !== id)
      if (favourite) favourites.unshift(updated)
      else conversations.push(updated)
      conversations.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return { conversations, favourites }
    })
  },
}))

onSessionChange(() => useConversationStore.setState(initial))
