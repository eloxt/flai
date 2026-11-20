import type { MessageRecord } from "@flai/shared"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { createInstance } from "i18next"
import { I18nextProvider } from "react-i18next"
import { afterEach, expect, it } from "vitest"
import { useChatStore } from "~/features/chat/chat-store"
import { ConversationCost } from "~/features/chat/components/conversation-cost"
import translation from "../public/locales/en/translation.json"

afterEach(() => {
  cleanup()
  useChatStore.setState({ map: {} })
})

it("opens the cost breakdown and preserves older totals across reply branches", async () => {
  const i18n = createInstance()
  await i18n.init({ lng: "en", resources: { en: { translation } } })
  const current: MessageRecord = {
    id: "current", parentId: "prompt", role: "assistant", createdAt: "2026-11-20T00:00:00Z",
    parts: [{ type: "dynamic-tool", toolName: "web_search", toolCallId: "tool", state: "output-available", input: {}, output: {}, providerExecuted: true }],
    metadata: {
      usage: {
        inputTokens: 20_000, cachedInputTokens: 8_000, outputTokens: 2_000, toolInputTokens: 2_000,
        costBreakdown: { input: 0.02, output: 0.04, cacheRead: 0.004, cacheWrite: 0, toolInput: 0.004 },
        toolCallsCost: 0.01, cost: 0.078,
      },
    },
  }
  const older: MessageRecord = {
    ...current, id: "older", parts: [], metadata: { usage: { inputTokens: 1_000, outputTokens: 1_000, cost: 0.022 } },
  }
  useChatStore.setState({ map: { current, older } })
  render(<I18nextProvider i18n={i18n}><ConversationCost /></I18nextProvider>)

  fireEvent.click(screen.getByRole("button", { name: /estimated cost.*\$0\.1/i }))
  const dialog = within(await screen.findByRole("dialog"))
  expect(dialog.getByText("24,000")).toBeVisible()
  expect(dialog.getByText("Historical cost (no breakdown)")).toBeVisible()
  expect(dialog.getByText("22%")).toBeVisible()
  const segments = screen.getByRole("dialog").querySelectorAll<HTMLElement>(".bg-current")
  expect([...segments].reduce((sum, segment) => sum + Number(segment.style.flexGrow), 0)).toBeCloseTo(100)
  const tools = dialog.getByRole("button", { name: "Tool calls" })
  fireEvent.click(tools)
  expect(tools).toHaveAttribute("aria-expanded", "true")
  expect(dialog.getByText(/1 call · \$0\.01/)).toBeVisible()
  expect(dialog.getByText(/2,000 Tokens · \$0\.004/)).toBeVisible()

  act(() => useChatStore.setState({
    map: {
      current,
      older: { ...older, metadata: { usage: {
        ...older.metadata.usage,
        costBreakdown: { input: 0.004, output: 0.018, cacheRead: 0, cacheWrite: 0, toolInput: 0 },
        reconstructedCost: true,
      } } },
    },
  }))
  expect(dialog.queryByText("Historical cost (no breakdown)")).not.toBeInTheDocument()
  expect(dialog.getByText(/keeping the saved total/)).toBeVisible()
  expect(dialog.getByText("58%")).toBeVisible()
})
