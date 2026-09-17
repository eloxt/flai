import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SystemConfigSettings } from "@/components/admin/system-config-settings";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), put: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const { t } = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("@/components/ui/select", () => ({
    Select: ({ value, onValueChange, disabled, children }: { value: string; onValueChange: (value: string) => void; disabled: boolean; children: React.ReactNode }) => <select value={value} onChange={event => onValueChange(event.target.value)} disabled={disabled}>{children}</select>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, disabled, children }: { value: string; disabled: boolean; children: React.ReactNode }) => <option value={value} disabled={disabled}>{children}</option>,
    SelectTrigger: () => null,
    SelectValue: () => null,
}));
let root: Root;
let element: HTMLDivElement;
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
    vi.mocked(api.put).mockResolvedValue({});
});
afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
});
it("loads both system prompts and saves them together", async () => {
    vi.mocked(api.get).mockResolvedValue({ value: { prompt: "chat prompt", translate: "translate {{text}}" } });
    await act(async () => root.render(<SystemConfigSettings configKey="system_prompt" />));
    expect(Array.from(element.querySelectorAll("textarea"), node => node.value)).toEqual(["chat prompt", "translate {{text}}"]);
    await act(async () => { element.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(api.put).toHaveBeenCalledWith("/admin/system-config/system_prompt", { value: { prompt: "chat prompt", translate: "translate {{text}}" } });
});
it("resets the title model when the provider changes and saves the new selection", async () => {
    vi.mocked(api.get).mockImplementation(async url => url === "/api/provider" ? [
        { id: "p1", name: "P1", model: [{ id: "m1", name: "M1" }] },
        { id: "p2", name: "P2", model: [{ id: "m2", name: "M2" }] },
    ] : { value: { provider_id: "p1", model_name: "m1", prompt: "title" } });
    await act(async () => root.render(<SystemConfigSettings configKey="title_generation" />));
    const [provider, model] = element.querySelectorAll("select");
    await act(async () => { provider.value = "p2"; provider.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    expect(Array.from(model.options, option => option.value)).toEqual(["m2"]);
    await act(async () => { model.value = "m2"; model.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => { element.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(api.put).toHaveBeenCalledWith("/admin/system-config/title_generation", { value: expect.objectContaining({ provider_id: "p2", model_name: "m2", prompt: "title" }) });
});
it("blocks saving after a failed load and allows reloading", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ value: { prompt: "loaded", translate: "template" } });
    await act(async () => root.render(<SystemConfigSettings configKey="system_prompt" />));
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await act(async () => element.querySelector<HTMLButtonElement>('button[type="button"]')!.click());
    expect(element.querySelector("textarea")!.value).toBe("loaded");
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
});
