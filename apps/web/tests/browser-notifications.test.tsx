import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PreferenceSettings } from "~/components/settings/preference-settings"
import {
  closeConversation,
  openConversation,
  sendMessage,
} from "~/features/chat/chat-store"
import { setNotificationNavigator } from "~/lib/browser-notifications"
import { useAppStore } from "~/store/app-store"
import { useAuthStore } from "~/store/auth-store"
import { useConversationStore } from "~/store/conversation-store"
import { useModelStore } from "~/store/model-store"

vi.mock("~/i18n", () => ({
  default: {
    t: (key: string, values?: { title?: string }) =>
      values?.title ? `${key}:${values.title}` : key,
  },
}))

class FakeNotification {
  static permission: NotificationPermission = "granted"
  static requestPermission = vi.fn<() => Promise<NotificationPermission>>()
  static shown: FakeNotification[] = []
  onclick: (() => void) | null = null
  close = vi.fn()
  constructor(
    public title: string,
    public options: NotificationOptions
  ) {
    FakeNotification.shown.push(this)
  }
}

const sse = (chunks: object[]) =>
  chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")

const text = (delta: string) => [
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta },
  { type: "text-end", id: "t" },
]

const stream = (chunks: object[]) =>
  new Response(sse(chunks), {
    headers: { "content-type": "text/event-stream" },
  })

const conversation = (id: string, title: string) => ({
  id,
  title,
  icon: null,
  favourite: false,
  createdAt: "",
  updatedAt: "",
})

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: hidden,
  })
}

const fetchMock = vi.fn<typeof fetch>()

function replyWith(chunks: object[]) {
  fetchMock.mockImplementation(async (_url, init) => {
    const { assistantId } = JSON.parse(String(init?.body))
    return stream([{ type: "start", messageId: assistantId }, ...chunks])
  })
}

const finish = { type: "finish", finishReason: "stop" }

beforeEach(() => {
  FakeNotification.permission = "granted"
  FakeNotification.requestPermission.mockReset()
  FakeNotification.shown = []
  vi.stubGlobal("Notification", FakeNotification)
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  setHidden(true)
  useAppStore.setState({ browserNotifications: true })
  useAuthStore.setState({
    tokens: { accessToken: "a", refreshToken: "r", expiresIn: 1 },
    user: null,
  })
  useConversationStore.setState({
    conversations: [conversation("c1", "Trip plan")],
    favourites: [],
  })
  useModelStore.setState({
    providers: [
      {
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
      },
    ],
    selected: { providerId: "p", modelId: "m" },
    loaded: true,
  })
})

afterEach(() => {
  cleanup()
  useAuthStore.getState().logout()
  closeConversation()
  setNotificationNavigator(null)
  vi.unstubAllGlobals()
  setHidden(false)
})

describe("reply notifications", () => {
  it("names the conversation and quotes the reply, without code fences", async () => {
    await openConversation("c1", { empty: true })
    replyWith([...text("Day one\n```js\nx()\n```\nDay two"), finish])
    await sendMessage({ text: "Hi" })
    expect(FakeNotification.shown).toHaveLength(1)
    expect(FakeNotification.shown[0]).toMatchObject({
      title: "Trip plan",
      options: {
        body: "Day one Day two",
        tag: "c1",
        data: { url: "/chat/c1" },
      },
    })
  })

  it("falls back to generic copy for an untitled conversation", async () => {
    await openConversation("new", { empty: true })
    replyWith([...text(""), finish])
    await sendMessage({ text: "Hi" })
    expect(FakeNotification.shown[0]).toMatchObject({
      title: "pages.chat.notification.complete",
      options: { body: "pages.chat.notification.messageReady" },
    })
  })

  it.each([
    ["the page is visible", () => setHidden(false)],
    [
      "the setting is off",
      () => useAppStore.setState({ browserNotifications: false }),
    ],
    ["permission is denied", () => (FakeNotification.permission = "denied")],
  ])("stays quiet when %s", async (_name, arrange) => {
    arrange()
    await openConversation("c1", { empty: true })
    replyWith([...text("Hello"), finish])
    await sendMessage({ text: "Hi" })
    expect(FakeNotification.shown).toHaveLength(0)
  })

  it("never asks for permission from a finished reply", async () => {
    FakeNotification.permission = "default"
    await openConversation("c1", { empty: true })
    replyWith([...text("Hello"), finish])
    await sendMessage({ text: "Hi" })
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
  })

  it("reports a failed reply with its error", async () => {
    await openConversation("c1", { empty: true })
    fetchMock.mockImplementationOnce(async (_url, init) => {
      const { assistantId } = JSON.parse(String(init?.body))
      fetchMock.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              ...conversation("c1", "Trip plan"),
              messages: [],
            }),
            {
              headers: { "content-type": "application/json" },
            }
          )
      )
      return stream([
        { type: "start", messageId: assistantId },
        { type: "error", errorText: "Rate limited" },
      ])
    })
    await sendMessage({ text: "Hi" })
    expect(FakeNotification.shown).toHaveLength(1)
    expect(FakeNotification.shown[0]).toMatchObject({
      title: "pages.chat.notification.failedIn:Trip plan",
      options: { body: "Rate limited" },
    })
  })

  it("covers a reply finishing in a conversation the user has left", async () => {
    let release!: () => void
    fetchMock.mockImplementation(async (_url, init) => {
      const { assistantId } = JSON.parse(String(init?.body))
      await new Promise<void>((resolve) => (release = resolve))
      return stream([
        { type: "start", messageId: assistantId },
        ...text("Hello"),
        finish,
      ])
    })
    await openConversation("c1", { empty: true })
    const sent = sendMessage({ text: "Hi" })
    await vi.waitFor(() => expect(release).toBeDefined())
    await openConversation("c2", { empty: true })
    release()
    await sent
    expect(FakeNotification.shown[0]).toMatchObject({
      title: "Trip plan",
      options: { body: "Hello" },
    })
  })

  it("does not report a subscription dropped by logging out", async () => {
    let release!: () => void
    fetchMock.mockImplementation(async (_url, init) => {
      await new Promise<void>((resolve) => (release = resolve))
      init!.signal!.throwIfAborted()
      return stream([])
    })
    await openConversation("c1", { empty: true })
    const sent = sendMessage({ text: "Hi" })
    await vi.waitFor(() => expect(release).toBeDefined())
    useAuthStore.getState().logout()
    release()
    await sent
    expect(FakeNotification.shown).toHaveLength(0)
  })
})

describe("clicking a notification", () => {
  it("focuses the window and opens the conversation inside the app", async () => {
    const navigate = vi.fn()
    const focus = vi.spyOn(window, "focus").mockImplementation(() => {})
    setNotificationNavigator(navigate)
    await openConversation("c1", { empty: true })
    replyWith([...text("Hello"), finish])
    await sendMessage({ text: "Hi" })
    const [notification] = FakeNotification.shown
    notification!.onclick!()
    expect(focus).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith("/chat/c1")
    expect(notification!.close).toHaveBeenCalled()
  })
})

describe("browsers without page notifications", () => {
  it("shows the notification through the service worker", async () => {
    const showNotification = vi.fn()
    vi.stubGlobal(
      "Notification",
      Object.assign(
        class {
          constructor() {
            throw new TypeError("Illegal constructor")
          }
        },
        { permission: "granted" }
      )
    )
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ showNotification }) },
    })
    await openConversation("c1", { empty: true })
    replyWith([...text("Hello"), finish])
    await sendMessage({ text: "Hi" })
    await vi.waitFor(() => expect(showNotification).toHaveBeenCalled())
    expect(showNotification.mock.calls[0]).toMatchObject([
      "Trip plan",
      { body: "Hello", data: { url: "/chat/c1" } },
    ])
    Reflect.deleteProperty(navigator, "serviceWorker")
  })
})

describe("notification setting", () => {
  const toggle = () =>
    screen.getByRole("switch", {
      name: "pages.settings.preference.browserNotifications",
    })

  it("asks for permission when turned on", async () => {
    FakeNotification.permission = "default"
    FakeNotification.requestPermission.mockResolvedValue("granted")
    render(<PreferenceSettings />)
    expect(toggle()).not.toBeChecked()
    await userEvent.click(toggle())
    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce()
    expect(toggle()).toBeChecked()
  })

  it("stays off if permission is refused", async () => {
    FakeNotification.permission = "default"
    FakeNotification.requestPermission.mockResolvedValue("denied")
    render(<PreferenceSettings />)
    await userEvent.click(toggle())
    expect(toggle()).not.toBeChecked()
    expect(
      await screen.findByText(
        "pages.settings.preference.browserNotificationsBlocked"
      )
    ).toBeInTheDocument()
  })

  it("turns off without touching the browser permission", async () => {
    render(<PreferenceSettings />)
    expect(toggle()).toBeChecked()
    await userEvent.click(toggle())
    expect(toggle()).not.toBeChecked()
    expect(useAppStore.getState().browserNotifications).toBe(false)
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
  })
})
