/** Escape text placed between XML-style tags in a prompt. */
export const escapeXml = (s: string) => s.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[ch]!)

/** Cut `text` to `max` characters, marking the cut with an ellipsis. */
export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

/** A date as YYYY-MM-DD (UTC). */
export const isoDay = (d: Date | string) => new Date(d).toISOString().slice(0, 10)
