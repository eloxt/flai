import type { ModelConfig, ModelRef, PublicProvider } from "@flai/shared"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { api } from "~/lib/api"
import { onSessionChange } from "./auth-store"

interface ModelState {
  providers: PublicProvider[]
  loaded: boolean
  selected: ModelRef | null
  load: () => Promise<PublicProvider[]>
  select: (ref: ModelRef | null) => void
}

export const useModelStore = create<ModelState>()(
  persist(
    (set) => ({
      providers: [],
      loaded: false,
      selected: null,
      load: async () => {
        const providers = await api<PublicProvider[]>("/models")
        set({ providers, loaded: true })
        return providers
      },
      select: (selected) => set({ selected }),
    }),
    {
      name: "flai-model",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ selected: s.selected }),
    }
  )
)

onSessionChange(() => useModelStore.setState({ providers: [], loaded: false, selected: null }))

export function findModel(
  providers: PublicProvider[],
  ref: ModelRef | null
): { provider: PublicProvider; model: ModelConfig } | null {
  if (!ref) return null
  const provider = providers.find((p) => p.id === ref.providerId)
  const model = provider?.models.find((m) => m.id === ref.modelId)
  return provider && model ? { provider, model } : null
}

/** The currently selected provider + model, or null if nothing valid is selected. */
export function useCurrentModel() {
  const providers = useModelStore((s) => s.providers)
  const selected = useModelStore((s) => s.selected)
  return findModel(providers, selected)
}
