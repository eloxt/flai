import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
    resolve: { alias: { "@": path.resolve(__dirname, "app") } },
    test: { environment: "jsdom", clearMocks: true, setupFiles: ["./tests/setup.ts"] },
});
