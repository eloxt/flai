import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ModelEditor } from "@/components/admin/model-editor";
import { ChatInput } from "@/components/chat-input";
import { useModelStore } from "@/store/model-store";
import { useInputStore } from "@/store/input-store";
import type { Model } from "@/types/models";
const { t } = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/components/ui/dropdown-menu", () => {
    const Group = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
    return { DropdownMenu: Group, DropdownMenuContent: Group, DropdownMenuLabel: Group, DropdownMenuSeparator: () => null, DropdownMenuTrigger: Group, DropdownMenuGroup: Group,
        DropdownMenuCheckboxItem: ({ children, checked, onCheckedChange }: { children: React.ReactNode; checked: boolean; onCheckedChange: () => void }) => <button role="menuitemcheckbox" aria-checked={checked} onClick={onCheckedChange}>{children}</button>,
    };
});
let root: Root;
let element: HTMLDivElement;
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
    useInputStore.setState({ thinkingIntensity: null, selectedTools: [], attachments: [] });
});
afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
    vi.unstubAllGlobals();
});
it("shows configured levels for arbitrary names and clears invalid selection on model switch", async () => {
    useModelStore.setState({ currentModel: { id: "custom-model", thinking_levels: ["low", "max"] } as Model });
    await act(async () => root.render(<ChatInput value="" onChange={() => {}} onSend={() => {}} />));
    expect(Array.from(element.querySelectorAll('[role="menuitemcheckbox"]'), node => node.textContent)).toEqual(["components.chatInput.thinking.low", "components.chatInput.thinking.max"]);
    expect(element.querySelector('[role="menuitemcheckbox"][aria-checked="true"]')?.textContent).toBe("components.chatInput.thinking.low");
    await act(async () => (element.querySelectorAll('[role="menuitemcheckbox"]')[1] as HTMLButtonElement).click());
    expect(useInputStore.getState().thinkingIntensity).toBe("max");
    await act(async () => useModelStore.setState({ currentModel: { id: "gpt-5.4", thinking_levels: [] } as unknown as Model }));
    expect(element.querySelector('[role="menuitemcheckbox"]')).toBeNull();
    expect(useInputStore.getState().thinkingIntensity).toBeNull();
});
it("edits the per-model level list without changing other model fields", async () => {
    let models: Model[] = [];
    function Harness() {
        const [value, setValue] = useState<Model[]>([{ id: "custom", name: "Custom", thinking_levels: ["high"] } as Model]);
        models = value;
        return <ModelEditor models={value} onChange={setValue} />;
    }
    await act(async () => root.render(<Harness />));
    await act(async () => element.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')!.click());
    await act(async () => element.querySelector<HTMLButtonElement>('button[aria-label="max"]')!.click());
    expect(models[0].thinking_levels).toEqual(["high", "max"]);
    expect(models[0].id).toBe("custom");
    await act(async () => element.querySelector<HTMLButtonElement>('button[aria-label="high"]')!.click());
    expect(models[0].thinking_levels).toEqual(["max"]);
});
