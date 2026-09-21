import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import FeedbackDialog from "@/components/feedback-dialog";
import { api } from "@/lib/api";
import { toast } from "sonner";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it("blocks empty feedback, preserves failed content, and clears it after successful retry", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    try {
        await act(async () => root.render(<FeedbackDialog />));
        await act(async () => element.querySelector("button")!.click());
        const submit = document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        const textarea = document.querySelector("textarea")!;
        expect(submit.disabled).toBe(true);
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "  建议 & / ?  ");
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
        });
        vi.mocked(api.post).mockRejectedValueOnce(new Error("Bark unavailable"));
        await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
        expect(api.post).toHaveBeenCalledWith("/api/user/feedback", { content: "建议 & / ?" });
        expect(toast.error).toHaveBeenCalled();
        expect(textarea.value).toBe("  建议 & / ?  ");
        expect(submit.disabled).toBe(false);
        let resolve: (value: unknown) => void;
        vi.mocked(api.post).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
        expect(submit.disabled).toBe(true);
        expect(textarea.disabled).toBe(true);
        await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
        expect(api.post).toHaveBeenCalledTimes(2);
        await act(async () => resolve!({}));
        expect(toast.success).toHaveBeenCalled();
        expect(document.querySelector("textarea")).toBeNull();
        await act(async () => element.querySelector("button")!.click());
        expect(document.querySelector("textarea")!.value).toBe("");
    } finally {
        await act(async () => root.unmount());
        element.remove();
        vi.unstubAllGlobals();
        vi.resetAllMocks();
    }
});
