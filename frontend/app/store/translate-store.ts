import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TranslateState {
    sourceLanguage: string | null;
    targetLanguage: string | null;
    customInstruction: string;
    setSourceLanguage: (value: string) => void;
    setTargetLanguage: (value: string) => void;
    setCustomInstruction: (value: string) => void;
}

export const useTranslateStore = create<TranslateState>()(
    persist(
        (set) => ({
            sourceLanguage: null,
            targetLanguage: null,
            customInstruction: "",
            setSourceLanguage: (value) => set({ sourceLanguage: value }),
            setTargetLanguage: (value) => set({ targetLanguage: value }),
            setCustomInstruction: (value) => set({ customInstruction: value }),
        }),
        {
            name: 'translate-store',
        }
    )
);
