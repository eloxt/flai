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
        }),
        {
            name: 'input-store',
            partialize: (state) => ({ selectedTools: state.selectedTools }),
        }
    )
);
