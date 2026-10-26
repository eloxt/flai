import { createContext, useContext, useEffect, useState } from "react"

export type Theme = "dark" | "light" | "system"

interface ThemeState {
  theme: Theme
  /** The theme actually applied (system resolved). */
  resolved: "dark" | "light"
  setTheme: (theme: Theme) => void
}

const STORAGE_KEY = "flai-theme"
const ThemeContext = createContext<ThemeState | null>(null)

const systemDark = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored =
      typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY)
    return stored === "dark" || stored === "light" ? stored : "system"
  })
  const [prefersDark, setPrefersDark] = useState(
    () => typeof window !== "undefined" && systemDark()
  )

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const update = () => setPrefersDark(query.matches)
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", resolved === "dark")
    root.style.colorScheme = resolved
    // The browser bar follows the applied theme, not just the system one, so a chosen theme matches too.
    const ground = getComputedStyle(root).getPropertyValue("--page").trim()
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", ground))
  }, [resolved])

  const setTheme = (next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next)
    setThemeState(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
