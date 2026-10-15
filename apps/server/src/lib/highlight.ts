const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Build a snippet around the first match and wrap every occurrence of `terms` in <em>.
 * (Postgres' ts_headline with zhparser drops whitespace, so we highlight ourselves.)
 * The returned text is NOT HTML-escaped apart from the <em> markers; render it as text.
 */
export function highlight(text: string, terms: string[], radius = 60): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const words = [...new Set(terms.filter(Boolean))].sort((a, b) => b.length - a.length)
  if (words.length === 0) return clean.slice(0, radius * 2)
  const pattern = new RegExp(words.map(escapeRegExp).join('|'), 'gi')

  const first = clean.search(pattern)
  const start = first <= radius ? 0 : first - radius
  const end = Math.min(clean.length, (first < 0 ? 0 : first) + radius * 2)
  const snippet = (start > 0 ? '…' : '') + clean.slice(start, end) + (end < clean.length ? '…' : '')
  return snippet.replace(pattern, (m) => `<em>${m}</em>`)
}
