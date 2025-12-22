import { create } from 'zustand';

interface InputState {
    mainInput: string;
    sendMainInput: boolean;
    setMainInput: (value: string) => void;
    setSendMainInput: (value: boolean) => void;
    chatInputs: Record<string, string>;
    setChatInput: (conversationId: string, value: string) => void;
}

export const useInputStore = create<InputState>((set) => ({
    mainInput: "",
    sendMainInput: false,
    setMainInput: (value) => set({ mainInput: value }),
    setSendMainInput: (value) => set({ sendMainInput: value }),
    chatInputs: {},
    setChatInput: (conversationId, value) =>
        set((state) => ({
            chatInputs: {
                ...state.chatInputs,
                [conversationId]: value
            }
        })),
}));
