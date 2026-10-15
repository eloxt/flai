import "@testing-library/jest-dom/vitest"

// jsdom lacks these; the chat store schedules UI flushes with rAF.
globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0)) as never
globalThis.cancelAnimationFrame ??= ((id: number) => clearTimeout(id)) as never
