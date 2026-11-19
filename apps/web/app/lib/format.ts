export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function initials(name?: string | null): string {
  const clean = (name ?? "").trim()
  if (!clean) return "U"
  const words = clean.split(/\s+/)
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : clean.slice(0, 2)).toUpperCase()
}

export const formatNumber = (n: number | undefined) => (n === undefined ? "-" : n.toLocaleString())

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 3 })
export const formatUsd = (n: number) => (n > 0 && n < 0.0001 ? "< $0.0001" : usd.format(n))

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString()
}

/** Drop code fences (including generative UI programs) from previews; they would read as noise. */
export const stripFences = (text: string) =>
  text
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
