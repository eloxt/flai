import { create } from "zustand"
import { persist } from "zustand/middleware"
import { onSessionChange } from "./auth-store"

interface TranslateState {
  source: string
  target: string
  instruction: string
  set: (patch: Partial<Pick<TranslateState, "source" | "target" | "instruction">>) => void
}

const initial = { source: "Chinese", target: "English", instruction: "" }

export const useTranslateStore = create<TranslateState>()(
  persist((set) => ({ ...initial, set: (patch) => set(patch) }), {
    name: "flai-translate",
    partialize: (s) => ({ source: s.source, target: s.target, instruction: s.instruction }),
  })
)

onSessionChange(() => useTranslateStore.setState(initial))
