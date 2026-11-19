import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { generateSW } from "workbox-build"

const clientDir = resolve(import.meta.dirname, "../build/client")

// Precache the app shell and every route module (with its static imports and CSS), so the
// installed app opens and navigates without the network. Heavier lazy chunks (Mermaid, KaTeX,
// syntax grammars) are cached on first use instead; there are thousands of them.
const routeManifest = readdirSync(resolve(clientDir, "assets")).find((name) => /^manifest-\w+\.js$/.test(name))
if (!routeManifest) throw new Error("React Router manifest not found in build/client/assets")
const shellAssets = new Set(
  [readFileSync(resolve(clientDir, "index.html"), "utf8"), readFileSync(resolve(clientDir, "assets", routeManifest), "utf8")]
    .flatMap((source) => source.match(/\/assets\/[\w.-]+\.(?:js|css)/g) ?? []),
)
shellAssets.add(`/assets/${routeManifest}`)

const { count, size, warnings } = await generateSW({
  globDirectory: clientDir,
  globPatterns: ["index.html", "manifest.json", "*.{png,ico,svg}", "locales/**/*.json"],
  // Hashed file names already change with their content.
  additionalManifestEntries: [...shellAssets].map((url) => ({ url, revision: null })),
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  swDest: resolve(clientDir, "sw.js"),
  inlineWorkboxRuntime: true,
  sourcemap: false,
  importScripts: ["/notification-click.js"],
  // A new version waits until the user chooses to reload (see app/lib/service-worker.ts).
  skipWaiting: false,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [
    {
      // The conversation list, each opened conversation and the model list, so past chats can
      // still be read offline. Always fresh when online; app/lib/service-worker.ts clears this
      // cache on logout, since it holds one user's data.
      urlPattern: ({ url, sameOrigin }) =>
        sameOrigin && /^\/api\/v1\/(?:conversations(?:\/[^/]+)?|models)$/.test(url.pathname),
      handler: "NetworkFirst",
      options: {
        cacheName: "flai-history",
        cacheableResponse: { statuses: [200] },
        expiration: { maxEntries: 300 },
      },
    },
    {
      urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/assets/"),
      handler: "CacheFirst",
      options: {
        cacheName: "flai-assets",
        expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 60 },
      },
    },
  ],
})

for (const warning of warnings) console.warn(warning)
console.log(`sw.js: precached ${count} files, ${(size / 1024 / 1024).toFixed(1)} MB`)
