import { File } from '@/page/chat';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface InputState {
    mainInput: string;
    sendMainInput: boolean;
    selectedTools: string[];
    setMainInput: (value: string) => void;
    setSendMainInput: (value: boolean) => void;
    setSelectedTools: (value: string[]) => void;
    chatInputs: Record<string, string>;
    setChatInput: (conversationId: string, value: string) => void;
    attachments: File[];
    addAttachment: (file: File) => void;
    removeAttachment: (id: string) => void;
    clearAttachments: () => void;
}

export const useInputStore = create<InputState>()(
    persist(
        (set) => ({
            mainInput: "",
            sendMainInput: false,
            selectedTools: ["internal_web_search"],
            setMainInput: (value) => set({ mainInput: value }),
            setSendMainInput: (value) => set({ sendMainInput: value }),
            setSelectedTools: (value) => set({ selectedTools: value }),
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
