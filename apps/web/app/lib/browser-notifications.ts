import { useAppStore } from "~/store/app-store"

export type NotificationAccess = NotificationPermission | "unsupported"

export const notificationAccess = (): NotificationAccess =>
  typeof window !== "undefined" && "Notification" in window
    ? Notification.permission
    : "unsupported"

type Navigate = (url: string) => void

let navigate: Navigate | null = null

/** Lets a notification click move inside the app, keeping other replies streaming. */
export function setNotificationNavigator(next: Navigate | null) {
  navigate = next
}

interface BackgroundNotification {
  conversationId: string
  title: string
  body: string
}

/** Tell the user about a conversation, if the page is out of sight and they allow notifications. */
export function notifyInBackground({
  conversationId,
  title,
  body,
}: BackgroundNotification) {
  if (!document.hidden || !useAppStore.getState().browserNotifications) return
  if (notificationAccess() !== "granted") return
  const url = `/chat/${conversationId}`
  // A newer notification for the conversation replaces the last one.
  const options = {
    body,
    icon: "/favicon.ico",
    tag: conversationId,
    data: { url },
  }
  try {
    const notification = new Notification(title, options)
    notification.onclick = () => {
      window.focus()
      notification.close()
      if (navigate) navigate(url)
      else window.location.assign(url)
    }
  } catch {
    // Mobile browsers only show notifications from the service worker; public/notification-click.js
    // handles the click there.
    void navigator.serviceWorker?.ready.then((registration) =>
      registration.showNotification(title, options)
    )
  }
}
