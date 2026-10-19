import type { FlaiPart, FlaiUIMessage, ProviderType } from '@flai/shared'
import { convertToModelMessages, type ModelMessage } from 'ai'
import { AppError } from '../lib/errors'
import type { MessageRow } from '../services/conversations'
import { isTextFile } from '../lib/file-types'

const MAX_INLINE_TEXT = 200_000

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
  const prepared = await Promise.all(parts.map(async (part): Promise<FlaiPart | null> => {
    if (part.type === 'reasoning' || part.type === 'source-url' || part.type === 'source-document' || part.type === 'step-start') {
      return null
    }
    if (part.type === 'file' && isTextFile(part.mediaType, part.filename)) {
      let content: string
      try {
        content = await downloadText(part.url)
      } catch (error) {
        throw new AppError('UPSTREAM', `Could not read attachment ${part.filename ?? ''}: ${(error as Error).message}`)
      }
      return { type: 'text', text: `<file name="${part.filename ?? 'attachment'}">\n${content}\n</file>` }
    }
    if (part.type === 'file' && providerType === 'openai_completion' && !part.mediaType.startsWith('image/')) {
      throw new AppError('VALIDATION', `This model only accepts image attachments (${part.filename ?? part.mediaType})`)
    }
    return part
  }))
  return prepared.filter((part) => part !== null)
}

export async function toModelMessages(path: MessageRow[], providerType: ProviderType): Promise<ModelMessage[]> {
  // Attachments are fetched again on every turn, so fetch them all at once.
  const prepared = await Promise.all(path.map(async (row): Promise<FlaiUIMessage> => ({
    id: row.id, role: row.role, parts: await prepareParts(row.parts, providerType),
  })))
  return convertToModelMessages(prepared.filter((m) => m.parts.length > 0), { ignoreIncompleteToolCalls: true })
}
