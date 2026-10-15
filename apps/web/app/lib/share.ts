export const EXPIRY_OPTIONS = ["1h", "1d", "7d", "30d", "never"] as const
export type ExpiryOption = (typeof EXPIRY_OPTIONS)[number]

/** Translation key suffix under components.share.expiration. */
export const EXPIRY_LABELS: Record<ExpiryOption, string> = { "1h": "1hour", "1d": "1day", "7d": "7days", "30d": "30days", never: "never" }

const HOURS: Record<Exclude<ExpiryOption, "never">, number> = { "1h": 1, "1d": 24, "7d": 24 * 7, "30d": 24 * 30 }

/** ISO expiry for an option, or null for links that never expire. */
export function expiryFrom(option: ExpiryOption, now = Date.now()): string | null {
  return option === "never" ? null : new Date(now + HOURS[option] * 3600_000).toISOString()
}

export const shareUrl = (id: string) => `${window.location.origin}/share/${id}`
