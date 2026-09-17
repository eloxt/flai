import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api, readSSE } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useInputStore } from "@/store/input-store";
import { useConversationStore, type Conversation } from "@/store/conversation-store";
import { useAppStore } from "@/store/app-store";
import { useModelStore } from "@/store/model-store";
import { useChat } from "@/page/chat/use-chat";
import type { Model } from "@/types/models";
import type { TreeNode } from "@/types/chat";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (value: string) => value }) }));
vi.mock("i18next", () => ({ t: (value: string) => value }));

function login(id = "a") {
    useAuthStore.getState().login({
        user: { id, email: `${id}@example.test`, username: id, role: "user", is_active: 1 },
        token: { access_token: id, expires_in: 3600 },
    });
}
function json(data: unknown, code = 0) {
    return new Response(JSON.stringify({ code, data, message: code ? "Unauthorized" : "" }), { headers: { "Content-Type": "application/json" } });
}
function reader(chunks: string[]) {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({ start(controller) { chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk))); controller.close(); } }).getReader();
}
const favourite: Conversation = { id: "c", title: "Private conversation", icon: "", generating: false, created_at: "2026-01-01", updated_at: "2026-01-01", favourite: 1 };

beforeEach(() => {
    login();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(() => vi.unstubAllGlobals());

describe("stream protocol", () => {
    it.each([200, 401])("logs out on a JSON or HTTP 401 (%s)", async status => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"code":401,"message":"expired"}', { status, headers: { "Content-Type": "application/json" } })));
        await expect(api.stream("/stream")).rejects.toMatchObject({ code: 401 });
        expect(useAuthStore.getState().user).toBeNull();
    });
    it("handles split events and a final DONE without newline", async () => {
        const values = [];
        for await (const event of readSSE(reader(['data: {"text":', '"你好"}\r\n\r\n', 'data:[DONE]']))) values.push(event);
        expect(values).toEqual([{ text: "你好" }]);
    });
    it.each(['data: {"type":"error","data":{"message":"save failed"}}', 'data: {"type":"message"}\n\n'])('rejects errors and incomplete streams: %s', async payload => {
        const consume = async () => { for await (const _event of readSSE(reader([payload]))) { /* consume */ } };
        await expect(consume()).rejects.toThrow();
    });
    it("preserves aborts and rejects responses from a previous login", async () => {
        let resolve!: (response: Response) => void;
        vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
        const pending = api.get("/private");
        login("b");
        resolve(json({ private: "a" }));
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    });
});

describe("user-scoped stores", () => {
    it("clears private drafts, attachments, conversations and paths on logout", () => {
        useInputStore.getState().setMainInput("secret draft");
        useInputStore.setState({ attachments: [{ id: "secret-file", file_name: "secret", path: "private", created_at: new Date(), mime_type: "image/png", size: 10, public_url: "https://example.test/private" }] });
        useConversationStore.setState({ favouriteConversations: [favourite] });
        useAppStore.setState({ currentMessagePath: [{ id: "secret-message" } as TreeNode] });
        useAuthStore.getState().logout();
        expect(useInputStore.getState().mainInput).toBe("");
        expect(useInputStore.getState().attachments).toEqual([]);
        expect(useConversationStore.getState().favouriteConversations).toEqual([]);
        expect(useAppStore.getState().currentMessagePath).toEqual([]);
    });
    it("returns an unfavourited conversation to the normal list", async () => {
        useConversationStore.setState({ conversations: [], favouriteConversations: [favourite] });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(null)).mockResolvedValueOnce(json({ records: [{ ...favourite, favourite: 0 }], current: 1, size: 20, total: 1 })));
        await useConversationStore.getState().toggleFavourite("c", true);
        expect(useConversationStore.getState().conversations.map(c => c.id)).toEqual(["c"]);
        expect(useConversationStore.getState().favouriteConversations).toEqual([]);
        expect(useConversationStore.getState().hasMore).toBe(false);
    });
    it("clears title loading after failure in both lists", async () => {
        useConversationStore.setState({ conversations: [favourite], favouriteConversations: [favourite] });
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
        await useConversationStore.getState().generateTitle("c");
        expect(useConversationStore.getState().conversations[0].generating).toBe(false);
        expect(useConversationStore.getState().favouriteConversations[0].generating).toBe(false);
    });
    it("does not restore an old user's list after switching accounts", async () => {
        let resolve!: (response: Response) => void;
        vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
        const pending = useConversationStore.getState().fetchConversations();
        login("b");
        resolve(json({ records: [favourite], current: 1, size: 20, total: 1 }));
        await pending;
        expect(useConversationStore.getState().conversations).toEqual([]);
    });
});

describe("chat lifecycle", () => {
    let root: Root;
    let element: HTMLDivElement;
    let chat: ReturnType<typeof useChat>;
    let stream: ReadableStreamDefaultController<Uint8Array>;
    let signal: AbortSignal | null;
    let postCount: number;
    function Harness({ id }: { id: string }) { chat = useChat(id); return null; }
    beforeEach(async () => {
        useModelStore.setState({ currentModel: { id: "model", provider_id: "provider" } as Model });
        postCount = 0;
        signal = null;
        vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
            if (url.endsWith("/cancel")) return json(null);
            if (url.endsWith("/generate-title")) return json({ title: "New chat", icon: "" });
            if (options.method !== "POST") return json([]);
            postCount++;
            signal = options.signal || null;
            const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } });
            signal?.addEventListener("abort", () => stream.error(new DOMException("Aborted", "AbortError")), { once: true });
            return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
        }));
        element = document.createElement("div");
        root = createRoot(element);
        await act(async () => { root.render(<Harness id="a" />); });
    });
    afterEach(async () => { await act(async () => root.unmount()); });
    it("submits a new conversation once without aborting it during StrictMode effect replay", async () => {
        await act(async () => {
            useInputStore.setState({ mainInput: "first message", sendMainInput: true });
            root.render(<StrictMode><Harness key="new" id="new" /></StrictMode>);
        });
        expect(postCount).toBe(1);
        expect(signal?.aborted).toBe(false);
        expect(chat.isStreaming).toBe(true);
        expect(useInputStore.getState().mainInput).toBe("");
        expect(useConversationStore.getState().conversations.filter(c => c.id === "new")).toHaveLength(1);
        await act(async () => {
            stream.enqueue(new TextEncoder().encode('data: {"type":"message","data":{"content":"answer"}}\n\ndata: [DONE]\n\n'));
            stream.close();
        });
        expect(chat.path).toHaveLength(2);
        expect(chat.isStreaming).toBe(false);
    });
    it("blocks overlapping sends and retries synchronously", async () => {
        let pending!: Promise<void>;
        await act(async () => { pending = chat.sendMessage({ text: "first" }); });
        await act(async () => {
            await chat.sendMessage({ text: "second" });
            await chat.retryMessage(chat.path[0]);
        });
        expect(postCount).toBe(1);
        await act(async () => {
            stream.enqueue(new TextEncoder().encode('data: {"type":"message","data":{"content":"answer"}}\n\ndata: [DONE]\n\n'));
            stream.close();
            await pending;
        });
        expect(chat.path).toHaveLength(2);
        expect(chat.isStreaming).toBe(false);
    });
    it("unsubscribes A and prevents its late completion from entering B", async () => {
        let pending!: Promise<void>;
        await act(async () => { pending = chat.sendMessage({ text: "private A" }); });
        const previousSignal = signal;
        await act(async () => { root.render(<Harness key="b" id="b" />); });
        await act(async () => { await pending; });
        expect(previousSignal?.aborted).toBe(true);
        expect(chat.path).toEqual([]);
        expect(chat.streamingMessage).toBeNull();
    });
    it("keeps a stopped generation busy until partial output is saved", async () => {
        let pending!: Promise<void>;
        await act(async () => { pending = chat.sendMessage({ text: "hello" }); });
        await act(async () => { await chat.cancelGeneration(); });
        expect(chat.isStreaming).toBe(true);
        expect(signal?.aborted).toBe(false);
        await act(async () => { await chat.sendMessage({ text: "too early" }); });
        expect(postCount).toBe(1);
        await act(async () => {
            stream.enqueue(new TextEncoder().encode('data: {"type":"message","data":{"content":"partial"}}\n\ndata: [DONE]\n\n'));
            stream.close();
            await pending;
        });
        expect(chat.isStreaming).toBe(false);
        expect(chat.path).toHaveLength(2);
    });
    it.each([
        { levels: ["low", "max"], selected: "max", expected: "max" },
        { levels: ["low", "max"], selected: "high", expected: "low" },
        { levels: [], selected: "high", expected: null },
    ])("sends only a configured thinking level: $expected", async ({ levels, selected, expected }) => {
        useModelStore.setState({ currentModel: { id: "custom-model", provider_id: "provider", thinking_levels: levels } as Model });
        useInputStore.setState({ thinkingIntensity: selected });
        let pending!: Promise<void>;
        await act(async () => { pending = chat.sendMessage({ text: "hello" }); });
        const call = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/messages")!;
        expect(JSON.parse(call[1]!.body as string).thinking_intensity).toBe(expected);
        await act(async () => {
            stream.enqueue(new TextEncoder().encode('data: {"type":"message","data":{"content":"answer"}}\n\ndata: [DONE]\n\n'));
            stream.close();
            await pending;
        });
    });
    it("retains all images from a pure-image response", async () => {
        let pending!: Promise<void>;
        await act(async () => { pending = chat.sendMessage({ text: "draw" }); });
        await act(async () => {
            stream.enqueue(new TextEncoder().encode('data: {"type":"image","data":"https://example.test/1"}\n\ndata: {"type":"image","data":"https://example.test/2"}\n\ndata: [DONE]\n\n'));
            stream.close();
            await pending;
        });
        expect(chat.path[1].content).toEqual([{ type: "message", data: { content: "", images: [{ id: "", public_url: "https://example.test/1" }, { id: "", public_url: "https://example.test/2" }] } }]);
    });
    it("keeps a saved reply in the tree when recovering from a missing DONE", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        let pending!: Promise<void>;
        await act(async () => { pending = chat.sendMessage({ text: "hello" }); });
        const user = chat.path[0];
        const assistant = { ...chat.streamingMessage!, content: [{ type: "message", data: { content: "saved answer" } }] };
        vi.mocked(fetch).mockResolvedValueOnce(json([user, assistant]));
        await act(async () => {
            stream.close();
            await pending;
        });
        expect(chat.path.map(message => message.id)).toEqual([user.id, assistant.id]);
        expect(chat.nodeMap.get(assistant.id)?.content).toEqual(assistant.content);
        expect(chat.nodeMap.get(user.id)?.children.map(message => message.id)).toContain(assistant.id);
        expect(chat.isStreaming).toBe(false);
        vi.mocked(console.error).mockRestore();
    });
    it("removes pending output on an SSE save failure", async () => {
        let pending!: Promise<void>;
        await act(async () => { pending = chat.sendMessage({ text: "hello" }); });
        await act(async () => {
            stream.enqueue(new TextEncoder().encode('data: {"type":"error","data":{"message":"save failed"}}\n\n'));
            stream.close();
            await pending;
        });
        expect(chat.streamingMessage).toBeNull();
        expect(chat.path.some(message => message.content.some(content => content.type === "pending"))).toBe(false);
        expect(chat.isStreaming).toBe(false);
    });
});
