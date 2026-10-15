import type { FileRecord, McpToolRef, ThinkingLevel } from "@flai/shared"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { onSessionChange } from "./auth-store"

export type BuiltinTool = "webSearch" | "urlContext"

/** Text queued on the landing page, sent once the new conversation opens. */
export interface PendingSend {
  conversationId: string
  text: string
  files: FileRecord[]
}

interface InputState {
  /** Drafts keyed by conversation id ("new" for the landing page). */
  drafts: Record<string, string>
  setDraft: (key: string, value: string) => void
  /** Attachments keyed like drafts. */
  attachments: Record<string, FileRecord[]>
  setAttachments: (key: string, files: FileRecord[]) => void
  builtinTools: BuiltinTool[]
  setBuiltinTools: (tools: BuiltinTool[]) => void
  mcpTools: McpToolRef[]
  setMcpTools: (tools: McpToolRef[]) => void
  thinking: ThinkingLevel | null
  setThinking: (level: ThinkingLevel | null) => void
  pending: PendingSend | null
  setPending: (pending: PendingSend | null) => void
}

const initial = {
  drafts: {},
  attachments: {},
  builtinTools: ["webSearch"] as BuiltinTool[],
  mcpTools: [],
  thinking: null,
  pending: null,
}

export const useInputStore = create<InputState>()(
  persist(
    (set) => ({
      ...initial,
      setDraft: (key, value) => set((s) => ({ drafts: { ...s.drafts, [key]: value } })),
      setAttachments: (key, files) => set((s) => ({ attachments: { ...s.attachments, [key]: files } })),
      setBuiltinTools: (builtinTools) => set({ builtinTools }),
      setMcpTools: (mcpTools) => set({ mcpTools }),
      setThinking: (thinking) => set({ thinking }),
      setPending: (pending) => set({ pending }),
    }),
    {
      name: "flai-input",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ builtinTools: s.builtinTools, drafts: s.drafts }),
    }
  )
)

onSessionChange(() => useInputStore.setState(initial))
