import type { FlaiPart, FlaiUIMessage, ProviderType } from '@flai/shared'
import { convertToModelMessages, type ModelMessage } from 'ai'
import { AppError } from '../lib/errors'
import type { MessageRow } from '../services/conversations'

const MAX_INLINE_TEXT = 200_000

const TEXT_TYPES = /^(text\/|application\/(json|xml|yaml|x-yaml|javascript|typescript|x-sh|toml|sql))/

export const isTextLike = (mediaType: string) => TEXT_TYPES.test(mediaType)

async function downloadText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  return text.length > MAX_INLINE_TEXT ? `${text.slice(0, MAX_INLINE_TEXT)}\n…[truncated]` : text
}

/**
 * Turn the stored parts into parts the model can consume:
 * - reasoning, sources and step markers are UI-only and dropped from history;
 * - text-like attachments are inlined as text, since providers only accept images/PDFs as files;
 * - Chat Completions providers only accept images.
 */
async function prepareParts(parts: FlaiPart[], providerType: ProviderType): Promise<FlaiPart[]> {
  const out: FlaiPart[] = []
  for (const part of parts) {
    if (part.type === 'reasoning' || part.type === 'source-url' || part.type === 'source-document' || part.type === 'step-start') {
      continue
    }
    if (part.type === 'file' && isTextLike(part.mediaType)) {
      let content: string
      try {
        content = await downloadText(part.url)
      } catch (error) {
        throw new AppError('UPSTREAM', `Could not read attachment ${part.filename ?? ''}: ${(error as Error).message}`)
      }
      out.push({ type: 'text', text: `<file name="${part.filename ?? 'attachment'}">\n${content}\n</file>` })
      continue
    }
    if (part.type === 'file' && providerType === 'openai_completion' && !part.mediaType.startsWith('image/')) {
      throw new AppError('VALIDATION', `This model only accepts image attachments (${part.filename ?? part.mediaType})`)
    }
    out.push(part)
  }
  return out
}

export async function toModelMessages(path: MessageRow[], providerType: ProviderType): Promise<ModelMessage[]> {
  const ui: FlaiUIMessage[] = []
  for (const row of path) {
    const parts = await prepareParts(row.parts, providerType)
    if (parts.length > 0) ui.push({ id: row.id, role: row.role, parts })
  }
  return convertToModelMessages(ui, { ignoreIncompleteToolCalls: true })
}
