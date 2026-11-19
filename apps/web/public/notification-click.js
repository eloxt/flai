// Imported into the generated service worker (scripts/generate-sw.ts). Handles clicks on the
// notifications app/lib/browser-notifications.ts shows through the worker.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? "/"
  event.waitUntil(
    (async () => {
      const [client] = await self.clients.matchAll({ type: "window" })
      if (!client) return self.clients.openWindow(url)
      await client.focus()
      return client.navigate(url)
    })(),
  )
})
