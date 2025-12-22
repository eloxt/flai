import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./app.css";
import "./i18n"; // Import i18n configuration
import { Suspense } from "react";

export default function App() {
    return (
        <ThemeProvider defaultTheme="system" storageKey="flai-theme">
            <Suspense fallback="">
                <Outlet />
            </Suspense>
        </ThemeProvider>
    );
}

export function Layout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
                <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
                <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
                <link rel="manifest" href="/site.webmanifest" />
                <title>FlaiChat</title>
                <Meta />
                <Links />
            </head>
            <body className="antialiased">
                {children}
                <Scripts />
                <Toaster position="top-center" richColors />
                <ScrollRestoration />
            </body>
        </html>
    );
}
