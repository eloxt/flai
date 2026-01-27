import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Model, Provider } from "../types/models";

// Re-export for backward compatibility
export type { Model, Provider };

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
