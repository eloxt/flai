import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
    plugins: [reactRouter(), tailwindcss(), tsconfigPaths()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./app")
        }
    },
    server: {
        proxy: {
            "/api": {
                target: "http://127.0.0.1:8000",
                changeOrigin: true,
            },
            "/auth": {
                target: "http://127.0.0.1:8000",
                changeOrigin: true,
            },
            "/admin": {
                target: "http://127.0.0.1:8000",
                changeOrigin: true,
            }
        }
    },
});
