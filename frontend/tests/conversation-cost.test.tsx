import { act } from "react";
import { createRoot } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { expect, it, vi } from "vitest";

import { ConversationCost } from "@/components/conversation-cost";
import type { Message, UsageRound } from "@/types/chat";
import translation from "../public/locales/en/translation.json";

it("shows known costs across saved branches and expands the tool breakdown", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const i18n = createInstance();
    await i18n.init({ lng: "en", resources: { en: { translation } }, interpolation: { escapeValue: false } });
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);

    const main: UsageRound = {
        input: { tokens: 18400, usd: 0.046 },
        cache_read: { tokens: 12000, usd: 0.003 },
        output: { tokens: 6400, usd: 0.064 },
        tool_input: { tokens: 1800, usd: 0.0045 },
        tools: [{ name: "web_search", calls: 3, usd: 0.03 }],
    };
    const reply: Message = {
        id: "first", parent_id: "prompt", role: "assistant", created_at: new Date(),
        content: [],
        meta_info: {
            provider_name: "Provider", model_name: "Model", prompt_token_count: 0,
            reasoning_token_count: 0, response_token_count: 0, cached_token_count: 0,
            tool_use_token_count: 0, usage: [main],
        },
    };
    const otherBranch: Message = {
        ...reply, id: "retry",
        content: [{ type: "tool_call", data: { id: "call", name: "calendar", arguments: {} } }],
        meta_info: {
            ...reply.meta_info!,
            usage: [{
                input: { tokens: 100, usd: 0.001 },
                output: { tokens: 0 },
                cache_read: { tokens: 0 },
                tool_input: { tokens: 0 },
            }],
        },
    };
    const messages = new Map([[reply.id, reply], [otherBranch.id, otherBranch]]);

    try {
        await act(async () => root.render(
            <I18nextProvider i18n={i18n}><ConversationCost messages={messages} streamingId="retry" /></I18nextProvider>,
        ));
        const trigger = element.querySelector("button")!;
        expect(trigger.textContent).toContain("$0.1475");

        await act(async () => trigger.click());
        const dialog = document.querySelector('[role="dialog"]')!;
        expect(dialog.textContent).toContain("Conversation cost");
        expect(dialog.textContent).toContain("38,600");
        expect(dialog.textContent).toContain("43.4%");

        await act(async () => root.render(
            <I18nextProvider i18n={i18n}><ConversationCost messages={messages} /></I18nextProvider>,
        ));
        expect(trigger.textContent).toContain("$0.1485");
        expect(dialog.textContent).toContain("38,700");
        expect(dialog.textContent).toContain("Known estimate");
        expect(dialog.textContent).toContain("Some usage or tool calls have no configured rate");

        const tools = dialog.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
        expect(tools.textContent).toContain("Tool calls");
        await act(async () => tools.click());
        expect(dialog.textContent).toContain("Web search");
        expect(dialog.textContent).toContain("3 calls · $0.0300");
        expect(dialog.textContent).toContain("1,800 Tokens · $0.0045");
        expect(dialog.textContent).toContain("MCP · calendar");
    } finally {
        await act(async () => root.unmount());
        element.remove();
        vi.unstubAllGlobals();
    }
});
