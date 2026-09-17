import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Chat from "@/page/chat/Chat";
import InspectionPanel from "@/components/inspection-panel";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";
import type { ReactFlowProps } from "@xyflow/react";
import type { Message } from "@/types/chat";

const { flowRender, controlsRender, fitView, flowState } = vi.hoisted(() => ({
    flowRender: vi.fn(), controlsRender: vi.fn(), fitView: vi.fn().mockResolvedValue(true),
    flowState: { width: 0, height: 0, initialized: false },
}));

vi.mock("react-router", () => ({ useParams: () => ({ conversationId: "tree" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/chat-input", () => ({ ChatInput: () => null }));
vi.mock("@/page/chat/ChatSkeleton", () => ({ ChatSkeleton: () => null }));
vi.mock("@/page/chat/MessageItem", () => ({ MessageItem: ({ message }: { message: Message }) => <div data-message-id={message.id} /> }));
vi.mock("@/components/ui/sidebar", () => {
    const setOpen = vi.fn();
    const Container = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
    return { Sidebar: Container, SidebarContent: Container, SidebarHeader: Container, useSidebar: () => ({ setOpen, setOpenMobile: setOpen, isMobile: false }) };
});
// Exercise the real layout and buttons without the browser canvas measurement layer.
vi.mock("@xyflow/react", () => ({
    useNodesInitialized: () => flowState.initialized,
    useStore: (selector: (state: typeof flowState) => unknown) => selector(flowState),
    useReactFlow: () => ({ fitView }),
    ReactFlow: (props: ReactFlowProps) => {
        flowRender(props);
        const nodes = props.nodes!;
        const edges = props.edges!;
        return (
        <div data-testid="tree" data-edges={edges.length}>
            {nodes.map(node => <div key={node.id} data-node-id={node.id}>{node.data.label as React.ReactNode}</div>)}
            {props.children}
        </div>
    ); }, Background: () => null, Controls: (props: unknown) => { controlsRender(props); return null; },
}));
const messages = [
    ["u1", "", "user"], ["a1", "u1", "assistant"],
    ["u2", "a1", "user"], ["a2", "u2", "assistant"],
    ["a3", "u1", "assistant"], ["u3", "a3", "user"], ["root2", "", "user"],
].map(([id, parent_id, role], i) => ({ id, parent_id, role, content: [{ type: "message", data: { content: id } }], created_at: new Date(2026, 0, i + 1) }));
let root: Root;
let element: HTMLDivElement;
const scrollIntoView = vi.fn();
const scrollTo = vi.fn();
function Harness() {
    const path = useAppStore(state => state.currentMessagePath);
    return <><Chat /><InspectionPanel messagePath={path} /></>;
}
beforeEach(async () => {
    Object.assign(flowState, { width: 0, height: 0, initialized: false });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    HTMLElement.prototype.scrollTo = scrollTo;
    useAuthStore.setState({ tokens: { access_token: "test", expires_in: 3600 } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: messages }), { headers: { "Content-Type": "application/json" } })));
    element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
    await act(async () => root.render(<Harness />));
});
afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});
it("shows all branches and switches before scrolling, preserving the target's descendants", async () => {
    expect(element.querySelectorAll("[data-node-id]")).toHaveLength(7);
    expect(element.querySelector('[data-node-id="__ROOT__"]')).toBeNull();
    expect(element.querySelector('[data-testid="tree"]')?.getAttribute("data-edges")).toBe("5");
    expect(useAppStore.getState().currentMessagePath.map(node => node.id)).toEqual(["root2"]);
    await act(async () => element.querySelector<HTMLButtonElement>('[data-node-id="u2"] button')!.click());
    expect(useAppStore.getState().currentMessagePath.map(node => node.id)).toEqual(["u1", "a1", "u2", "a2"]);
    expect(scrollTo.mock.instances[scrollTo.mock.instances.length - 1]).toBe(element.querySelector('[data-message-id="u2"]')?.parentElement?.parentElement);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(useAppStore.getState().scrollToMessageId).toBeNull();
    await act(async () => element.querySelector<HTMLButtonElement>('[data-node-id="a3"] button')!.click());
    expect(useAppStore.getState().currentMessagePath.map(node => node.id)).toEqual(["u1", "a3", "u3"]);
    await act(async () => element.querySelector<HTMLButtonElement>('[data-node-id="root2"] button')!.click());
    expect(useAppStore.getState().currentMessagePath.map(node => node.id)).toEqual(["root2"]);
});
it("locates an ancestor without changing its continuation and clears state on unmount", async () => {
    await act(async () => element.querySelector<HTMLButtonElement>('[data-node-id="a3"] button')!.click());
    await act(async () => element.querySelector<HTMLButtonElement>('[data-node-id="u1"] button')!.click());
    expect(useAppStore.getState().currentMessagePath.map(node => node.id)).toEqual(["u1", "a3", "u3"]);
    expect(scrollTo.mock.instances[scrollTo.mock.instances.length - 1]).toBe(element.querySelector('[data-message-id="u1"]')?.parentElement?.parentElement);
    await act(async () => root.render(null));
    expect(useAppStore.getState().currentMessageTree.size).toBe(0);
    expect(useAppStore.getState().currentMessagePath).toEqual([]);
});

it("waits for measured nodes and stable panel dimensions before fitting, without resetting user navigation", async () => {
    vi.useFakeTimers();
    expect(fitView).not.toHaveBeenCalled();
    Object.assign(flowState, { width: 120, height: 600 });
    await act(async () => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTime(200));
    expect(fitView).not.toHaveBeenCalled();

    flowState.initialized = true;
    await act(async () => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTime(50));
    flowState.width = 320;
    await act(async () => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTime(99));
    expect(fitView).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    const controls = controlsRender.mock.calls[controlsRender.mock.calls.length - 1][0];
    expect(fitView).toHaveBeenCalledExactlyOnceWith(controls.fitViewOptions);

    // Content/path updates must not override a manually panned/zoomed viewport.
    await act(async () => element.querySelector<HTMLButtonElement>('[data-node-id="a3"] button')!.click());
    await act(async () => vi.advanceTimersByTime(200));
    expect(fitView).toHaveBeenCalledTimes(1);

    flowState.width = 480;
    await act(async () => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTime(100));
    expect(fitView).toHaveBeenCalledTimes(2);
});

it("positions the target relative to the chat scroller without scrolling outer containers", async () => {
    const message = element.querySelector<HTMLElement>('[data-message-id="root2"]')!;
    const scroller = message.parentElement!.parentElement!;
    scroller.scrollTop = 200;
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({ top: 80 } as DOMRect);
    vi.spyOn(message, "getBoundingClientRect").mockReturnValue({ top: 380 } as DOMRect);
    await act(async () => element.querySelector<HTMLButtonElement>('[data-node-id="root2"] button')!.click());
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 500, behavior: "smooth" });
    expect(scrollTo.mock.instances[scrollTo.mock.instances.length - 1]).toBe(scroller);
    expect(scrollIntoView).not.toHaveBeenCalled();
});
