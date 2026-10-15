import type {
  ChatOptions,
  ConversationDetail,
  FileRecord,
  FlaiPart,
  FlaiUIMessage,
  MessageRecord,
  ModelRef,
  RegenerateInput,
  SendMessageInput,
} from "@flai/shared"
import { fileMetaOf } from "@flai/shared"
import { readUIMessageStream } from "ai"
import { create } from "zustand"
import i18n from "~/i18n"
import { api, apiFetch, errorText } from "~/lib/api"
import { notify } from "~/lib/notify"
import { ReplyStreamInterrupted, replyStream } from "~/lib/reply-stream"
import type { Chunk } from "~/lib/ui-stream"
import { onSessionChange, useAuthStore } from "~/store/auth-store"
import { useInputStore } from "~/store/input-store"
import { findModel, useModelStore } from "~/store/model-store"
import { ancestry, buildTree, latestPath, type MessageMap, pathThrough, removeMessage, siblingsOf, toMap, type Tree } from "./tree"

export interface StreamingState {
  assistantId: string
  /** The user message being answered. */
  parentId: string
  message: FlaiUIMessage
  stopping: boolean
}

interface ChatState {
  conversationId: string | null
  map: MessageMap
  tree: Tree
  /** Visible branch, root → leaf. */
  path: string[]
  loading: boolean
  streaming: StreamingState | null
}

const emptyTree = buildTree({})
const initial: ChatState = {
  conversationId: null,
  map: {},
  tree: emptyTree,
  path: [],
  loading: false,
  streaming: null,
}

export const useChatStore = create<ChatState>(() => initial)

const set = useChatStore.setState
const get = useChatStore.getState

function setMap(map: MessageMap, path?: string[]) {
  set({ map, tree: buildTree(map), ...(path ? { path } : {}) })
}

/** Identifies the current conversation view; async work checks it before touching state. */
let viewToken = 0
let loadAbort: AbortController | null = null
let streamAbort: AbortController | null = null

onSessionChange(() => closeConversation())

export function closeConversation() {
  viewToken++
  loadAbort?.abort()
  streamAbort?.abort()
  set(initial)
}

/** Load a conversation (or adopt it empty when it was just created). */
export async function openConversation(conversationId: string, { empty = false } = {}) {
  closeConversation()
  const token = viewToken
  set({ conversationId, loading: !empty })
  if (empty) return
  const detail = await reload(token)
  // A reply is still being written (e.g. the page was reloaded mid-reply): follow it again.
  const active = detail?.activeGeneration
  const state = get()
  if (active && token === viewToken && !state.streaming && !state.map[active.assistantId] && state.map[active.parentId]) {
    set({ path: ancestry(state.tree, active.parentId) })
    void followReply({ assistantId: active.assistantId, parentId: active.parentId })
  }
}

/** Refetch the open conversation, keeping the current branch when it still exists. */
async function reload(token = viewToken, keepId?: string): Promise<ConversationDetail | null> {
  const conversationId = get().conversationId
  if (!conversationId) return null
  loadAbort?.abort()
  const controller = new AbortController()
  loadAbort = controller
  try {
    const detail = await api<ConversationDetail>(`/conversations/${conversationId}`, { signal: controller.signal })
    if (token !== viewToken) return null
    const map = toMap(detail.messages)
    const tree = buildTree(map)
    const anchor = keepId && map[keepId] ? keepId : get().path.findLast((id) => map[id])
    set({ map, tree, path: anchor ? pathThrough(tree, anchor) : latestPath(tree), loading: false })
    return detail
  } catch (error) {
    if (controller.signal.aborted || token !== viewToken) return null
    set({ loading: false })
    notify.error(error)
    return null
  }
}

// ---------------------------------------------------------------- branch navigation

export function switchSibling(messageId: string, direction: -1 | 1) {
  const { tree, streaming } = get()
  if (streaming) return
  const info = siblingsOf(tree, messageId)
  const target = direction < 0 ? info.prev : info.next
  if (target) set({ path: pathThrough(tree, target) })
}

// ---------------------------------------------------------------- sending

function currentSelection(): { model: ModelRef; options: ChatOptions } | null {
  const { providers, selected } = useModelStore.getState()
  const found = findModel(providers, selected)
  if (!found || !selected) return null
  const { model } = found
  const input = useInputStore.getState()
  const thinking = input.thinking && model.thinkingLevels.includes(input.thinking) ? input.thinking : model.thinkingLevels[0]
  return {
    model: selected,
    options: {
      thinking,
      webSearch: input.builtinTools.includes("webSearch") && model.internalTools.includes("web_search"),
      urlContext: input.builtinTools.includes("urlContext") && model.internalTools.includes("url_context"),
      mcpTools: model.toolCall ? input.mcpTools : [],
    },
  }
}

const fileParts = (files: FileRecord[]): FlaiPart[] =>
  files.map((f) => ({
    type: "file",
    mediaType: f.mediaType,
    filename: f.name,
    url: f.url,
    providerMetadata: { flai: { fileId: f.id, size: f.size } },
  }))

export const fileIdsOf = (parts: FlaiPart[]) =>
  parts.flatMap((p) => (p.type === "file" ? [fileMetaOf(p)?.fileId] : [])).filter((id): id is string => Boolean(id))

interface SendArgs {
  text: string
  files?: FileRecord[]
  /** Defaults to the end of the visible branch. */
  parentId?: string | null
}

/** Send a user message and stream the reply. Returns false if nothing was sent. */
export async function sendMessage({ text, files = [], parentId }: SendArgs): Promise<boolean> {
  const state = get()
  const conversationId = state.conversationId
  if (!conversationId || state.streaming || (!text.trim() && files.length === 0)) return false
  const selection = currentSelection()
  if (!selection) {
    notify.error(i18n.t("common.error.modelProviderNotFound"))
    return false
  }

  const parent = parentId === undefined ? (state.path.at(-1) ?? null) : parentId
  const userId = crypto.randomUUID()
  const assistantId = crypto.randomUUID()
  const userMessage: MessageRecord = {
    id: userId,
    parentId: parent,
    role: "user",
    parts: [...(text ? [{ type: "text" as const, text }] : []), ...fileParts(files)],
    metadata: {},
    createdAt: new Date().toISOString(),
  }
  const map = { ...state.map, [userId]: userMessage }
  setMap(map, [...(parent ? ancestry(buildTree(map), parent) : []), userId])

  const body: SendMessageInput = {
    message: { id: userId, parentId: parent, text, fileIds: files.map((f) => f.id) },
    assistantId,
    model: selection.model,
    options: selection.options,
  }
  return followReply({ assistantId, parentId: userId, sentText: text, open: postStream(`/conversations/${conversationId}/messages`, body) })
}

/** Generate a new reply to `messageId` (a user message, or the user message above an assistant one). */
export async function regenerate(messageId: string): Promise<boolean> {
  const state = get()
  const conversationId = state.conversationId
  if (!conversationId || state.streaming) return false
  const target = state.map[messageId]
  const userId = target?.role === "assistant" ? target.parentId : target?.id
  if (!userId || state.map[userId]?.role !== "user") {
    notify.error(i18n.t("common.error.retry"))
    return false
  }
  const selection = currentSelection()
  if (!selection) {
    notify.error(i18n.t("common.error.modelProviderNotFound"))
    return false
  }
  set({ path: ancestry(state.tree, userId) })
  const assistantId = crypto.randomUUID()
  const body: RegenerateInput = { assistantId, model: selection.model, options: selection.options }
  return followReply({ assistantId, parentId: userId, open: postStream(`/conversations/${conversationId}/messages/${userId}/regenerate`, body) })
}

/** Edit a user message: the new text becomes a sibling branch under the same parent. */
export function editMessage(messageId: string, text: string) {
  const original = get().map[messageId]
  if (!original || original.role !== "user") return Promise.resolve(false)
  const files = original.parts.flatMap((p): FileRecord[] => {
    const meta = p.type === "file" ? fileMetaOf(p) : undefined
    return p.type === "file" && meta
      ? [{ id: meta.fileId, name: p.filename ?? "", mediaType: p.mediaType, size: meta.size ?? 0, url: p.url, createdAt: "" }]
      : []
  })
  return sendMessage({ text, files, parentId: original.parentId })
}

export async function stopGeneration() {
  const streaming = get().streaming
  if (!streaming || streaming.stopping) return
  set({ streaming: { ...streaming, stopping: true } })
  try {
    // The server stops the model (on whichever instance runs it) and still persists what was
    // generated; we keep reading the stream until it reports the saved message.
    await api(`/generations/${streaming.assistantId}/cancel`, { method: "POST" })
  } catch (error) {
    notify.error(error)
    const current = get().streaming
    if (current?.assistantId === streaming.assistantId) set({ streaming: { ...current, stopping: false } })
  }
}

/** Delete the last message of the visible branch and fall back to a sibling. */
export async function deleteLastMessage() {
  const { conversationId, path, tree, streaming } = get()
  const last = path.at(-1)
  if (!conversationId || !last || streaming) return
  try {
    await api(`/conversations/${conversationId}/messages/${last}`, { method: "DELETE" })
  } catch (error) {
    notify.error(error)
    return
  }
  const info = siblingsOf(tree, last)
  const fallback = info.prev ?? info.next
  const map = removeMessage(get().map, last)
  const nextTree = buildTree(map)
  set({ map, tree: nextTree, path: fallback ? pathThrough(nextTree, fallback) : path.slice(0, -1) })
}

// ---------------------------------------------------------------- streaming

function notifyIfHidden() {
  if (!document.hidden || !("Notification" in window)) return
  const show = () =>
    new Notification(i18n.t("pages.chat.notification.complete"), {
      body: i18n.t("pages.chat.notification.messageReady"),
      icon: "/favicon.ico",
    })
  if (Notification.permission === "granted") show()
  else if (Notification.permission !== "denied") void Notification.requestPermission().then((p) => p === "granted" && show())
}

const postStream = (url: string, body: unknown) => (signal: AbortSignal) => apiFetch(url, { method: "POST", body, signal })

interface FollowArgs {
  assistantId: string
  /** The user message being answered. */
  parentId: string
  /** Starts the reply; without it, joins one already in progress. */
  open?: (signal: AbortSignal) => Promise<Response>
  /** Restored to the draft if the user message turns out not to have been saved. */
  sentText?: string
}

/**
 * Show a reply as it streams in. Dropped connections are resumed transparently; if the reply
 * can't be followed to its end, reload from the server, which has it if it was saved.
 */
async function followReply({ assistantId, parentId, open, sentText }: FollowArgs): Promise<boolean> {
  const token = viewToken
  const session = useAuthStore.getState().sessionVersion
  const live = () => token === viewToken && session === useAuthStore.getState().sessionVersion
  const controller = new AbortController()
  streamAbort = controller

  let message: FlaiUIMessage = { id: assistantId, role: "assistant", parts: [] }
  set({ streaming: { assistantId, parentId, message, stopping: false } })

  // Batch UI updates to one per animation frame.
  let frame: number | null = null
  const flush = () => {
    frame = null
    const current = get().streaming
    if (live() && current?.assistantId === assistantId) set({ streaming: { ...current, message } })
  }
  const schedule = () => {
    frame ??= requestAnimationFrame(flush)
  }

  let finished = false
  let failure: string | undefined
  try {
    const chunks = replyStream(assistantId, controller.signal, open).pipeThrough(
      new TransformStream<Chunk, Chunk>({
        transform(chunk, ctrl) {
          if (chunk.type === "finish") finished = true
          if (chunk.type === "error") failure = chunk.errorText
          ctrl.enqueue(chunk)
        },
      })
    )
    for await (const snapshot of readUIMessageStream<FlaiUIMessage>({
      message,
      stream: chunks,
      onError: (error) => {
        failure ??= errorText(error)
      },
    })) {
      if (!live()) return false
      message = snapshot
      schedule()
    }
  } catch (error) {
    if (controller.signal.aborted || !live()) return false
    failure = error instanceof ReplyStreamInterrupted ? undefined : errorText(error)
  } finally {
    if (frame !== null) cancelAnimationFrame(frame)
    if (streamAbort === controller) streamAbort = null
  }
  if (!live()) return false

  if (finished && !failure && message.parts.length === 0) {
    // Stopped before any output: nothing was saved.
    set({ streaming: null, path: ancestry(get().tree, parentId) })
    return true
  }
  if (finished && !failure) {
    const record: MessageRecord = {
      id: assistantId,
      parentId,
      role: "assistant",
      parts: message.parts as FlaiPart[],
      metadata: message.metadata ?? {},
      createdAt: new Date().toISOString(),
    }
    const map = { ...get().map, [assistantId]: record }
    const tree = buildTree(map)
    set({ map, tree, path: ancestry(tree, assistantId), streaming: null })
    notifyIfHidden()
    return true
  }

  // The reply may still have been saved (e.g. it finished while we were offline): reload,
  // and only report a problem if it isn't there.
  set({ streaming: null })
  await reload(token, assistantId)
  if (!live()) return false
  const { conversationId, map } = get()
  if (map[assistantId] && !failure) return true
  notify.error(failure ?? i18n.t("pages.chat.streamInterrupted"))
  const lost = sentText !== undefined && conversationId && !map[parentId]
  if (lost && !useInputStore.getState().drafts[conversationId]) useInputStore.getState().setDraft(conversationId, sentText)
  return false
}

/** Messages on the visible branch (excluding the in-flight reply). */
export function useVisibleMessages(): MessageRecord[] {
  const map = useChatStore((s) => s.map)
  const path = useChatStore((s) => s.path)
  return path.map((id) => map[id]).filter((m): m is MessageRecord => Boolean(m))
}
