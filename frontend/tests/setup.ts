// Recent Node versions expose their own Web Storage globals. Use the browser
// environment's storage before Zustand creates its persisted stores.
declare const jsdom: { window: Window };
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: jsdom.window.localStorage });
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: jsdom.window.sessionStorage });
