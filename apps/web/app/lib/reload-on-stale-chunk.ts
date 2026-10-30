import { reloadToLatest } from "./service-worker"

// After a redeploy the previous build's hashed chunks are gone, so lazy imports from an
// already-open tab fail. Reload once to pick up the new build (through the new service worker,
// since the current one would serve the old shell again); if the chunk is still missing
// shortly after a reload, let the error reach the nearest boundary instead of looping.
const KEY = "flai-chunk-reload"
const WINDOW_MS = 10_000

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    try {
      const last = Number(sessionStorage.getItem(KEY))
      if (last && Date.now() - last < WINDOW_MS) return
      sessionStorage.setItem(KEY, String(Date.now()))
    } catch {
      return
    }
    event.preventDefault()
    void reloadToLatest()
  })
}

export {}
