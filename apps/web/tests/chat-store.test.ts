import type { ConversationDetail, MessageRecord, PublicProvider } from "@flai/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeConversation, openConversation, sendMessage, stopGeneration, useChatStore } from "~/features/chat/chat-store"
import { useAuthStore } from "~/store/auth-store"
import { useModelStore } from "~/store/model-store"

const provider: PublicProvider = {
  id: "p",
  name: "P",
  type: "openai",
  logo: null,
  models: [
    {
      id: "m",
      name: "M",
      attachment: false,
      reasoning: false,
      thinkingLevels: [],
      toolCall: false,
      structuredOutput: false,
      temperature: true,
      openWeights: false,
      generativeUi: false,
      modalities: { input: ["text"], output: ["text"] },
      internalTools: [],
    },
  ],
}

const sse = (chunks: object[], { finish = true } = {}) =>
  chunks
    .concat(finish ? [{ type: "finish", finishReason: "stop" }] : [])
    .map((c) => `data: ${JSON.stringify(c)}\n\n`)
    .join("")

/** SSE with event ids, as the server sends replies. */
const sseWithIds = (chunks: Array<[id: string, chunk: object]>) => chunks.map(([id, c]) => `id: ${id}\ndata: ${JSON.stringify(c)}\n\n`).join("")

function streamResponse(body: string, delayMs = 0) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      async start(controller) {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
        controller.enqueue(encoder.encode(body))
        controller.close()
      },
    }),
    { headers: { "content-type": "text/event-stream" } }
  )
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })

let detail: ConversationDetail
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  useAuthStore.setState({ tokens: { accessToken: "a", refreshToken: "r", expiresIn: 1 }, user: null })
  useModelStore.setState({ providers: [provider], selected: { providerId: "p", modelId: "m" }, loaded: true })
  detail = { id: "c1", title: "", icon: null, favourite: false, createdAt: "", updatedAt: "", messages: [] }
})

afterEach(() => {
  closeConversation()
  vi.unstubAllGlobals()
})

const reply = (assistantId: string) => [
  { type: "start", messageId: assistantId },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: "Hello" },
  { type: "text-end", id: "t" },
  { type: "message-metadata", messageMetadata: { modelId: "m" } },
]

describe("chat store", () => {
  it("sends a message and appends the streamed reply to the visible branch", async () => {
    await openConversation("c1", { empty: true })
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      return streamResponse(sse(reply(body.assistantId)))
    })
    expect(await sendMessage({ text: "Hi" })).toBe(true)
    const { path, map, streaming } = useChatStore.getState()
    expect(streaming).toBeNull()
    expect(path).toHaveLength(2)
    expect(map[path[0]!]!.parts).toEqual([{ type: "text", text: "Hi" }])
    expect(map[path[1]!]).toMatchObject({ role: "assistant", parentId: path[0], metadata: { modelId: "m" } })
    expect(map[path[1]!]!.parts.find((p) => p.type === "text")).toMatchObject({ text: "Hello" })
  })

  it("ignores a second send while a reply is streaming", async () => {
    await openConversation("c1", { empty: true })
    fetchMock.mockImplementation(async (_url, init) => streamResponse(sse(reply(JSON.parse(String(init?.body)).assistantId)), 30))
    const first = sendMessage({ text: "one" })
    expect(await sendMessage({ text: "two" })).toBe(false)
    await first
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("reloads from the server when the reply can't be resumed, keeping a saved reply", async () => {
    await openConversation("c1", { empty: true })
    let userId = ""
    let assistantId = ""
    fetchMock.mockImplementation(async (url, init) => {
      // The server no longer knows the reply (e.g. it finished long ago).
      if (String(url).includes("/generations/")) return json({ error: { code: "NOT_FOUND", message: "Generation not found" } }, 404)
      if (String(url).includes("/messages")) {
        const body = JSON.parse(String(init?.body))
        userId = body.message.id
        assistantId = body.assistantId
        return streamResponse(sse(reply(assistantId), { finish: false }))
      }
      const saved: MessageRecord[] = [
        { id: userId, parentId: null, role: "user", parts: [{ type: "text", text: "Hi" }], metadata: {}, createdAt: "2026-01-01T00:00:00Z" },
        { id: assistantId, parentId: userId, role: "assistant", parts: [{ type: "text", text: "Saved" }], metadata: {}, createdAt: "2026-01-01T00:00:01Z" },
      ]
      return json({ ...detail, messages: saved })
    })
    // Nothing was lost, so this counts as delivered.
    expect(await sendMessage({ text: "Hi" })).toBe(true)
    const { path, map } = useChatStore.getState()
    expect(path).toEqual([userId, assistantId])
    expect(map[assistantId]!.parts).toEqual([{ type: "text", text: "Saved" }])
  })

  it("resumes a dropped stream from the last event id without repeating chunks", async () => {
    await openConversation("c1", { empty: true })
    let assistantId = ""
    const resumedFrom: string[] = []
    fetchMock.mockImplementation(async (url, init) => {
      const target = new URL(String(url), "http://x")
      if (target.pathname.endsWith("/messages")) {
        assistantId = JSON.parse(String(init?.body)).assistantId
        // The connection drops halfway through the reply.
        return streamResponse(
          sseWithIds([
            ["1", { type: "start", messageId: assistantId }],
            ["2", { type: "text-start", id: "t" }],
            ["3", { type: "text-delta", id: "t", delta: "Hel" }],
          ])
        )
      }
      resumedFrom.push(target.searchParams.get("after") ?? "")
      return streamResponse(
        sseWithIds([
          ["4", { type: "text-delta", id: "t", delta: "lo" }],
          ["5", { type: "text-end", id: "t" }],
          ["6", { type: "finish", finishReason: "stop" }],
        ])
      )
    })
    expect(await sendMessage({ text: "Hi" })).toBe(true)
    expect(resumedFrom).toEqual(["3"])
    const { map, streaming } = useChatStore.getState()
    expect(streaming).toBeNull()
    expect(map[assistantId]!.parts).toEqual([{ type: "text", text: "Hello", state: "done" }])
  })

  it("re-attaches to a reply still being written when the conversation opens", async () => {
    const user: MessageRecord = { id: "u1", parentId: null, role: "user", parts: [{ type: "text", text: "Hi" }], metadata: {}, createdAt: "2026-01-01T00:00:00Z" }
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/generations/a1/stream")) return streamResponse(sseWithIds(reply("a1").map((c, i) => [String(i + 1), c])).concat(sse([])))
      return json({ ...detail, messages: [user], activeGeneration: { assistantId: "a1", parentId: "u1" } })
    })
    await openConversation("c1")
    await vi.waitFor(() => expect(useChatStore.getState().map.a1).toBeDefined())
    const { path, map, streaming } = useChatStore.getState()
    expect(streaming).toBeNull()
    expect(path).toEqual(["u1", "a1"])
    expect(map.a1!.parentId).toBe("u1")
  })

  it("drops results that arrive after switching conversations", async () => {
    await openConversation("c1", { empty: true })
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).includes("/messages")) return streamResponse(sse(reply(JSON.parse(String(init?.body)).assistantId)), 30)
      return json({ ...detail, id: "c2" })
    })
    const pending = sendMessage({ text: "Hi" })
    await openConversation("c2")
    await pending
    expect(useChatStore.getState()).toMatchObject({ conversationId: "c2", path: [], streaming: null })
  })

  it("stops via the cancel endpoint and keeps nothing when no output was produced", async () => {
    await openConversation("c1", { empty: true })
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/cancel")) {
        release()
        return new Response(null, { status: 204 })
      }
      const encoder = new TextEncoder()
      return new Response(
        new ReadableStream({
          async start(controller) {
            await gate
            controller.enqueue(encoder.encode(sse([{ type: "start" }])))
            controller.close()
          },
        }),
        { headers: { "content-type": "text/event-stream" } }
      )
    })
    const pending = sendMessage({ text: "Hi" })
    await vi.waitFor(() => expect(useChatStore.getState().streaming).not.toBeNull())
    await stopGeneration()
    await pending
    const { path, streaming } = useChatStore.getState()
    expect(streaming).toBeNull()
    expect(path).toHaveLength(1)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/cancel"))).toBe(true)
  })
})
