// After a redeploy the previous build's hashed chunks are gone, so lazy imports from an
// already-open tab fail. Reload once to pick up the new build; if the chunk is still missing
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
    window.location.reload()
  })
}

export {}
