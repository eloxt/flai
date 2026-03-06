import { Attachment, MCPTool } from '@/types/chat';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface InputState {
    mainInput: string;
    sendMainInput: boolean;
    selectedTools: string[];
    selectedMcpTools: MCPTool[];
    thinkingIntensity: string | null;
    setMainInput: (value: string) => void;
    setSendMainInput: (value: boolean) => void;
    setSelectedTools: (value: string[]) => void;
    addMcpTool: (tool: MCPTool) => void;
    removeMcpTool: (mcpId: string, toolName: string) => void;
    clearMcpTools: () => void;
    setThinkingIntensity: (value: string | null) => void;
    chatInputs: Record<string, string>;
    setChatInput: (conversationId: string, value: string) => void;
    attachments: Attachment[];
    addAttachment: (file: Attachment) => void;
    removeAttachment: (id: string) => void;
    clearAttachments: () => void;
}

export const useInputStore = create<InputState>()(
    persist(
        (set) => ({
            mainInput: "",
            sendMainInput: false,
            selectedTools: ["web_search"],
            selectedMcpTools: [],
            thinkingIntensity: null,
            setMainInput: (value) => set({ mainInput: value }),
            setSendMainInput: (value) => set({ sendMainInput: value }),
            setSelectedTools: (value) => set({ selectedTools: value }),
            addMcpTool: (tool) => set((state) => {
                // Avoid duplicates
                const exists = state.selectedMcpTools.some(
                    t => t.mcp_id === tool.mcp_id && t.name === tool.name
                );
                if (exists) return state;
                return { selectedMcpTools: [...state.selectedMcpTools, tool] };
            }),
            removeMcpTool: (mcpId, toolName) => set((state) => ({
                selectedMcpTools: state.selectedMcpTools.filter(
                    t => !(t.mcp_id === mcpId && t.name === toolName)
                )
            })),
            clearMcpTools: () => set({ selectedMcpTools: [] }),
            setThinkingIntensity: (value) => set({ thinkingIntensity: value }),
            chatInputs: {},
            setChatInput: (conversationId, value) =>
                set((state) => ({
                    chatInputs: {
                        ...state.chatInputs,
                        [conversationId]: value
                    }
                })),
            attachments: [],
            addAttachment: (file) => set((state) => ({ attachments: [...state.attachments, file] })),
            removeAttachment: (id) => set((state) => ({ attachments: state.attachments.filter((a) => a.id !== id) })),
            clearAttachments: () => set({ attachments: [] }),
        }),
        {
            name: 'input-store',
            partialize: (state) => ({ selectedTools: state.selectedTools }),
        }
    )
);

