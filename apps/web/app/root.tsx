import "./lib/disable-openui-devtools"
import "./lib/reload-on-stale-chunk"
import { Suspense } from "react"
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router"
import type { Route } from "./+types/root"
import { ThemeProvider } from "./components/theme-provider"
import { Toaster } from "./components/ui/toast"
import { TooltipProvider } from "./components/ui/tooltip"
import "./app.css"
import "./i18n"

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#fafaf9" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0c0a09" />
        <title>FlaiChat</title>
        {/* Apply the stored theme before first paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("flai-theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body className="overflow-hidden antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <Toaster>
        <TooltipProvider>
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </TooltipProvider>
      </Toaster>
    </ThemeProvider>
  )
}

export function HydrateFallback() {
  return null
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!"
  let details = "An unexpected error occurred."
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error"
    details = error.status === 404 ? "The requested page could not be found." : error.statusText || details
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message
  }
  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col justify-center gap-8 px-4 md:px-8">
      <h1 className="text-5xl leading-none font-light tracking-tight md:text-7xl">{message}</h1>
      <p className="max-w-[60ch] text-muted-foreground">{details}</p>
      <a className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4" href="/">
        Home
      </a>
    </main>
  )
}
