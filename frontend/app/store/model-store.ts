import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface Model {
    id: string;
    name: string;
    family?: string;
    provider_id?: string;
    attachment: boolean;
    reasoning: boolean;
    tool_call: boolean;
    structured_output?: boolean;
    temperature?: boolean;
    knowledge?: string;
    release_date?: string;
    last_updated?: string;
    modalities?: {
        input: string[];
        output: string[];
    };
    open_weights?: boolean;
    cost?: {
        input: number;
        output: number;
        cache_read?: number;
    };
    limit?: {
        context?: number;
        output?: number;
    };
}

export interface Provider {
    id: string;
    name: string;
    provider_type: string;
    model: Model[];
    logo: string;
}

interface ModelState {
    currentModel: Model | null;
    setCurrentModel: (model: Model | null) => void;
}

export const useModelStore = create<ModelState>()(
    persist(
        (set) => ({
            currentModel: null,
            setCurrentModel: (model) => set({ currentModel: model }),
        }),
        {
            name: "model-storage",
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                currentModel: state.currentModel,
            }),
        }
    )
);
