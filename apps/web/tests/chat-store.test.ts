import type { ConversationDetail, MessageRecord, PublicProvider } from "@flai/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { answerQuestion, closeConversation, openConversation, regenerate, sendMessage, stopGeneration, useChatStore } from "~/features/chat/chat-store"
import { useAuthStore } from "~/store/auth-store"
import { useConversationStore } from "~/store/conversation-store"
import { useModelStore } from "~/store/model-store"

vi.mock("~/i18n", () => ({ default: { t: (key: string) => key } }))

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
    hidden: false,
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
  useAuthStore.getState().logout()
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

describe("question answers", () => {
  let question: MessageRecord

  beforeEach(async () => {
    question = {
      id: "q-message", parentId: "u1", role: "assistant", createdAt: "2026-01-01T00:00:01Z", metadata: { providerId: "p", modelId: "m" },
      parts: [{ type: "tool-ask_user", toolCallId: "q1", state: "input-available", input: { question: "Which language?" } }],
    }
    detail.messages = [{ id: "u1", parentId: null, role: "user", parts: [{ type: "text", text: "Help" }], metadata: {}, createdAt: "2026-01-01T00:00:00Z" }, question]
    fetchMock.mockImplementation(async () => json(detail))
    await openConversation("c1")
    fetchMock.mockClear()
  })

  it("saves the tool answer and follows the continuation without another user bubble", async () => {
    let nextId = ""
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/answer")) {
        const body = JSON.parse(String(init?.body))
        expect(body).toMatchObject({ toolCallId: "q1", answer: "English" })
        nextId = body.assistantId
        return json({ message: { ...question, parts: [{ ...question.parts[0], state: "output-available", output: { answer: "English", content: "User answered: English", isError: false } }] }, generation: { assistantId: nextId, parentId: question.id } })
      }
      expect(String(url)).toContain(`/generations/${nextId}/stream`)
      return streamResponse(sse(reply(nextId)))
    })
    expect(await answerQuestion(question.id, "q1", "English")).toBe(true)
    await vi.waitFor(() => expect(useChatStore.getState().map[nextId]).toBeDefined())
    const { map, path, streaming, answering } = useChatStore.getState()
    expect(path).toEqual(["u1", question.id, nextId])
    expect(Object.values(map).filter((m) => m.role === "user")).toHaveLength(1)
    expect(map[question.id]!.parts[0]).toMatchObject({ state: "output-available", output: { answer: "English" } })
    expect(streaming).toBeNull()
    expect(answering).toBe(false)
  })

  it("routes composer text to the pending question and waits if more questions remain", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      expect(String(url)).toContain(`/messages/${question.id}/answer`)
      expect(JSON.parse(String(init?.body)).answer).toBe("Alex")
      return json({ message: { ...question, parts: [{ ...question.parts[0], state: "output-available", output: { answer: "Alex", content: "User answered: Alex", isError: false } }] }, generation: null })
    })
    expect(await sendMessage({ text: "Alex" })).toBe(true)
    expect(useChatStore.getState().path).toEqual(["u1", question.id])
    expect(useChatStore.getState().streaming).toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("preserves the pending question when saving fails", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith("/answer")) return json({ error: { code: "UNAVAILABLE", message: "Try again" } }, 503)
      return json(detail)
    })
    expect(await answerQuestion(question.id, "q1", "Alex")).toBe(false)
    expect(useChatStore.getState().map[question.id]!.parts[0]).toMatchObject({ state: "input-available" })
    expect(useChatStore.getState().answering).toBe(false)
    expect(useChatStore.getState().streaming).toBeNull()
  })

  it("keeps saved answers when retrying the continuation", async () => {
    useChatStore.setState({ map: { ...useChatStore.getState().map, [question.id]: {
      ...question, parts: [{ type: "tool-ask_user", toolCallId: "q1", input: { question: "Which language?" }, state: "output-available", output: { answer: "English", content: "User answered: English", isError: false } }],
    } } })
    let nextId = ""
    fetchMock.mockImplementation(async (url, init) => {
      expect(String(url)).toContain(`/messages/${question.id}/regenerate`)
      nextId = JSON.parse(String(init?.body)).assistantId
      return streamResponse(sse(reply(nextId)))
    })
    expect(await regenerate(question.id)).toBe(true)
    expect(useChatStore.getState().path).toEqual(["u1", question.id, nextId])
    expect(useChatStore.getState().map[question.id]!.parts[0]).toMatchObject({ output: { answer: "English" } })
  })

  it("ignores an answer response after switching conversations", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith("/answer")) {
        await gate
        return json({ message: question, generation: { assistantId: "next", parentId: question.id } })
      }
      if (String(url).includes("/generations/next/stream")) return streamResponse(sse(reply("next")))
      return json({ ...detail, id: "c2", messages: [] })
    })
    const pending = answerQuestion(question.id, "q1", "English")
    expect(useConversationStore.getState().replying.c1).toBeDefined()
    expect(await answerQuestion(question.id, "q1", "中文")).toBe(false)
    await openConversation("c2")
    expect(useConversationStore.getState().replying.c1).toBeDefined()
    release()
    expect(await pending).toBe(false)
    expect(useChatStore.getState()).toMatchObject({ conversationId: "c2", map: {}, path: [], streaming: null, answering: false })
    await vi.waitFor(() => expect(useConversationStore.getState().replying).toEqual({}))
  })
})

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

  it("tracks multiple replies after navigation and clears each one when it finishes", async () => {
    const pending = new Map<string, { assistantId: string; signal: AbortSignal; finish: () => void }>()
    fetchMock.mockImplementation(async (url, init) => {
      const id = String(url).includes("/conversations/c1/") ? "c1" : "c2"
      const { assistantId } = JSON.parse(String(init?.body))
      await new Promise<void>((resolve) => pending.set(id, { assistantId, signal: init!.signal!, finish: resolve }))
      return streamResponse(sse(reply(assistantId)))
    })
    await openConversation("c1", { empty: true })
    const first = sendMessage({ text: "First" })
    await openConversation("c2", { empty: true })
    const second = sendMessage({ text: "Second" })
    const c1 = pending.get("c1")!
    const c2 = pending.get("c2")!
    expect(c1.signal.aborted).toBe(false)
    expect(useConversationStore.getState().replying).toEqual({ c1: c1.assistantId, c2: c2.assistantId })

    c1.finish()
    await first
    expect(useConversationStore.getState().replying).toEqual({ c2: c2.assistantId })
    expect(useChatStore.getState().map[c1.assistantId]).toBeUndefined()
    expect(useChatStore.getState().streaming?.assistantId).toBe(c2.assistantId)

    c2.finish()
    expect(await second).toBe(true)
    expect(useConversationStore.getState().replying).toEqual({})
    expect(useChatStore.getState().map[c2.assistantId]).toBeDefined()
  })

  it("aborts background subscriptions and clears their status on logout", async () => {
    let signal: AbortSignal | undefined
    fetchMock.mockImplementation((_url, init) => new Promise<Response>((_resolve, reject) => {
      signal = init!.signal!
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
    }))
    await openConversation("c1", { empty: true })
    const pending = sendMessage({ text: "Hi" })
    closeConversation()
    expect(signal?.aborted).toBe(false)
    expect(useConversationStore.getState().replying.c1).toBeDefined()

    useAuthStore.getState().logout()
    expect(signal?.aborted).toBe(true)
    expect(useConversationStore.getState().replying).toEqual({})
    expect(await pending).toBe(false)
  })

  it("keeps the status when a visible subscription replaces a background one", async () => {
    let originalSignal: AbortSignal | undefined
    let assistantId = ""
    let userId = ""
    let finish!: () => void
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/messages")) {
        const body = JSON.parse(String(init?.body))
        assistantId = body.assistantId
        userId = body.message.id
        originalSignal = init!.signal!
        return new Promise<Response>((_resolve, reject) => {
          originalSignal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
        })
      }
      if (String(url).includes("/generations/")) {
        await new Promise<void>((resolve) => { finish = resolve })
        return streamResponse(sse(reply(assistantId)))
      }
      return json({
        ...detail,
        messages: [{ id: userId, parentId: null, role: "user", parts: [{ type: "text", text: "Hi" }], metadata: {}, createdAt: "" }],
        activeGeneration: { assistantId, parentId: userId },
      })
    })
    await openConversation("c1", { empty: true })
    const original = sendMessage({ text: "Hi" })
    closeConversation()
    await openConversation("c1")
    expect(await original).toBe(false)
    expect(originalSignal?.aborted).toBe(true)
    expect(useConversationStore.getState().replying).toEqual({ c1: assistantId })
    expect(useChatStore.getState().streaming?.assistantId).toBe(assistantId)

    finish()
    await vi.waitFor(() => expect(useChatStore.getState().map[assistantId]).toBeDefined())
    expect(useConversationStore.getState().replying).toEqual({})
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
