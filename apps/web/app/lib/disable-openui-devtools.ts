// @openuidev/react-lang auto-mounts a devtools widget in development that loads a script
// from a CDN and shows promotional popups. Claim its once-only flag so it never mounts.
// Must run before any module imports @openuidev/react-lang.
;(globalThis as Record<symbol, unknown>)[Symbol.for("openui.devtools.autoMount")] = true

export {}
