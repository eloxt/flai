/**
 * Pure conversions from the Go backend's data shapes to flai-next's.
 * Kept free of I/O so they can be unit-tested against real legacy samples.
 */
import {
  type FlaiPart,
  type GoogleGrounding,
  type MessageMetadata,
  type MessageRecord,
  type ModelConfig,
  modelConfigSchema,
  type Preferences,
  type SettingKey,
  textOf,
} from '@flai/shared'

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

// ---------------------------------------------------------------- messages

export interface LegacyContentItem {
  type: string
  data: unknown
}

/** Legacy `message.content` jsonb → UI message parts. */
export function convertContent(content: unknown): FlaiPart[] {
  const parts: FlaiPart[] = []
  const toolParts = new Map<string, Extract<FlaiPart, { type: 'dynamic-tool' }>>()

  for (const item of arr(content) as LegacyContentItem[]) {
    const data = obj(item?.data)
    switch (item?.type) {
      case 'message': {
        const text = str(data.content)
        if (text) parts.push({ type: 'text', text })
        for (const file of arr(data.files).map(obj)) {
          const url = str(file.public_url)
          if (!url) continue
          parts.push({
            type: 'file',
            mediaType: str(file.mime_type) || 'application/octet-stream',
            filename: str(file.file_name),
            url,
            providerMetadata: { flai: { fileId: str(file.id) ?? '', size: num(file.size) ?? 0 } },
          })
        }
        // Images produced by the removed image-generation tool stay viewable.
        for (const image of arr(data.images).map(obj)) {
          const url = str(image.public_url)
          if (url) parts.push({ type: 'file', mediaType: imageMediaType(url), url })
        }
        break
      }
      case 'reasoning': {
        const text = str(data.content)
        if (text) parts.push({ type: 'reasoning', text })
        break
      }
      case 'tool_call': {
        const id = str(data.id) ?? `legacy-${toolParts.size}`
        const part = {
          type: 'dynamic-tool' as const,
          toolName: str(data.name) ?? 'tool',
          toolCallId: id,
          state: 'input-available' as const,
          input: data.arguments ?? {},
        }
        toolParts.set(id, part)
        parts.push(part)
        break
      }
      case 'tool_result': {
        const id = str(data.id) ?? ''
        const call = toolParts.get(id)
        const content = str(data.content) ?? ''
        const isError = data.is_error === true
        const finished = {
          type: 'dynamic-tool' as const,
          toolName: call?.toolName ?? str(data.name) ?? 'tool',
          toolCallId: id || `legacy-result-${parts.length}`,
          input: call?.input ?? {},
          ...(isError
            ? { state: 'output-error' as const, errorText: content || 'Tool error' }
            : { state: 'output-available' as const, output: content }),
        } as Extract<FlaiPart, { type: 'dynamic-tool' }>
        if (call) parts[parts.indexOf(call)] = finished
        else parts.push(finished)
        break
      }
      // 'pending' placeholders and unknown types carry nothing worth keeping.
    }
  }

  // A call whose result never arrived would make the model API reject the history.
  return parts.map((p) =>
    p.type === 'dynamic-tool' && p.state === 'input-available'
      ? ({ ...p, state: 'output-error', errorText: 'No result recorded' } as FlaiPart)
      : p,
  )
}

function imageMediaType(url: string): string {
  const ext = /\.(png|jpe?g|webp|gif)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase()
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext ? `image/${ext}` : 'image/png'
}

/** Legacy `meta_info` → metadata, plus OpenAI URL citations as source parts. */
export function convertMetaInfo(meta: unknown): { metadata: MessageMetadata; sources: FlaiPart[] } {
  const m = obj(meta)
  const metadata: MessageMetadata = {}
  if (str(m.provider_name)) metadata.providerName = str(m.provider_name)
  if (str(m.model_name)) metadata.modelId = str(m.model_name)
  const usage = {
    inputTokens: num(m.prompt_token_count),
    outputTokens: num(m.response_token_count),
    reasoningTokens: num(m.reasoning_token_count),
    cachedInputTokens: num(m.cached_token_count),
    toolUseTokens: num(m.tool_use_token_count),
  }
  if (Object.values(usage).some((v) => v !== undefined)) metadata.usage = usage
  if (str(m.thought_signature)) metadata.thoughtSignature = str(m.thought_signature)
  if (m.google_grounding_data && typeof m.google_grounding_data === 'object') {
    metadata.googleGrounding = m.google_grounding_data as GoogleGrounding
  }

  const seen = new Set<string>()
  const sources: FlaiPart[] = []
  for (const a of arr(m.openai_grounding_data).map(obj)) {
    const url = str(a.url)
    if (!url || seen.has(url)) continue
    seen.add(url)
    sources.push({ type: 'source-url', sourceId: `legacy-${sources.length}`, url, title: str(a.title) })
  }
  return { metadata, sources }
}

export interface LegacyMessage {
  id: string
  parent_id: string
  role: string
  content: unknown
  meta_info: unknown
  created_at: string | Date
}

export function convertMessage(row: LegacyMessage): Omit<MessageRecord, 'createdAt'> & { searchText: string } {
  const { metadata, sources } = convertMetaInfo(row.meta_info)
  const parts = [...convertContent(row.content), ...sources]
  return {
    id: row.id,
    parentId: row.parent_id || null,
    role: row.role === 'user' ? 'user' : 'assistant',
    parts,
    metadata,
    searchText: textOf(parts),
  }
}

/** Share snapshots store legacy message entities; convert them to MessageRecord. */
export function convertShareMessages(messages: unknown): MessageRecord[] {
  return arr(messages)
    .map(obj)
    .map((m) => {
      const converted = convertMessage({
        id: str(m.id) ?? '',
        parent_id: str(m.parent_id) ?? '',
        role: str(m.role) ?? 'assistant',
        content: m.content,
        meta_info: m.meta_info,
        created_at: str(m.created_at) ?? '',
      })
      const created = new Date(str(m.created_at) ?? 0)
      const { searchText: _searchText, ...record } = converted
      return { ...record, createdAt: Number.isNaN(created.getTime()) ? new Date(0).toISOString() : created.toISOString() }
    })
}

// ---------------------------------------------------------------- providers

export function convertModel(raw: unknown): ModelConfig | undefined {
  const m = obj(raw)
  const cost = obj(m.cost)
  const over = obj(cost.context_over_200k)
  const limit = obj(m.limit)
  const modalities = obj(m.modalities)
  const parsed = modelConfigSchema.safeParse({
    id: m.id,
    name: str(m.name) ?? '',
    badge: str(m.badge) || undefined,
    family: str(m.family) || undefined,
    status: ['alpha', 'beta', 'deprecated'].includes(str(m.status) ?? '') ? m.status : undefined,
    attachment: m.attachment === true,
    reasoning: m.reasoning === true,
    thinkingLevels: [...new Set(arr(m.thinking_levels))],
    toolCall: m.tool_call === true,
    structuredOutput: m.structured_output === true,
    temperature: m.temperature === true,
    openWeights: m.open_weights === true,
    generativeUi: false,
    knowledge: str(m.knowledge) || undefined,
    releaseDate: str(m.release_date) || undefined,
    lastUpdated: str(m.last_updated) || undefined,
    modalities: { input: arr(modalities.input).filter(str), output: arr(modalities.output).filter(str) },
    cost:
      m.cost === undefined
        ? undefined
        : {
            input: num(cost.input) ?? 0,
            output: num(cost.output) ?? 0,
            cacheRead: num(cost.cache_read),
            cacheWrite: num(cost.cache_write),
            contextOver200k:
              cost.context_over_200k === undefined || cost.context_over_200k === null
                ? undefined
                : {
                    input: num(over.input) ?? 0,
                    output: num(over.output) ?? 0,
                    cacheRead: num(over.cache_read),
                    cacheWrite: num(over.cache_write),
                  },
          },
    limit: m.limit === undefined ? undefined : { context: num(limit.context), output: num(limit.output) },
    // image_generation was removed in flai-next.
    internalTools: arr(m.internal_tools).filter((t) => t === 'web_search' || t === 'url_context'),
  })
  return parsed.success ? parsed.data : undefined
}

// ---------------------------------------------------------------- users

export function convertAvatar(avatar: Buffer | null): string | null {
  if (!avatar || avatar.length === 0) return null
  const text = avatar.toString('utf8').trim()
  if (/^(data:image\/|https?:\/\/)/i.test(text)) return text
  return null
}

const PREFERENCE_KEYS: Record<string, string> = { sidebar_show_emoji: 'sidebarShowEmoji' }

export function convertPreferences(pref: unknown): Preferences {
  const out: Preferences = {}
  for (const [key, value] of Object.entries(obj(pref))) out[PREFERENCE_KEYS[key] ?? key] = value
  return out
}

// ---------------------------------------------------------------- settings

export interface LegacyNotification {
  id: string
  title: string
  content: string
  level: 'default' | 'warning'
}

export function convertSystemConfig(rows: Array<{ key: string; value: unknown }>): {
  settings: Array<{ key: SettingKey; value: unknown }>
  notifications: LegacyNotification[]
} {
  const get = (key: string) => obj(rows.find((r) => r.key === key)?.value)
  const settings: Array<{ key: SettingKey; value: unknown }> = []
  const systemPrompt = get('system_prompt')
  if (Object.keys(systemPrompt).length) {
    settings.push({
      key: 'system_prompt',
      value: { chat: str(systemPrompt.prompt) ?? '', translate: str(systemPrompt.translate) ?? '' },
    })
  }
  const title = get('title_generation')
  if (Object.keys(title).length) {
    settings.push({
      key: 'title_generation',
      value: {
        providerId: str(title.provider_id) ?? '',
        modelId: str(title.model_name) ?? '',
        prompt: str(title.prompt) ?? '',
      },
    })
  }
  const alert = get('error_alert')
  if (str(alert.bark_url)) settings.push({ key: 'error_alert', value: { barkUrl: str(alert.bark_url) } })

  const notifications = arr(get('notification').list)
    .map(obj)
    .filter((n) => str(n.title))
    .map((n, i) => ({
      id: str(n.id) || `legacy-notification-${i}`,
      title: str(n.title)!,
      content: str(n.content) ?? '',
      level: n.level === 'warning' ? ('warning' as const) : ('default' as const),
    }))
  return { settings, notifications }
}

// ---------------------------------------------------------------- tree helpers

/** Order rows so every parent precedes its children (FK-safe insert order). Orphans become roots. */
export function topoSort<T extends { id: string; parentId: string | null }>(rows: T[]): { rows: T[]; orphans: number } {
  const byId = new Map(rows.map((r) => [r.id, r]))
  let orphans = 0
  const fixed = rows.map((r) => {
    if (r.parentId && !byId.has(r.parentId)) {
      orphans++
      return { ...r, parentId: null }
    }
    return r
  })
  const children = new Map<string | null, T[]>()
  for (const r of fixed) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r])
  const out: T[] = []
  const visited = new Set<string>()
  const queue = [...(children.get(null) ?? [])]
  while (queue.length) {
    const node = queue.shift()!
    if (visited.has(node.id)) continue
    visited.add(node.id)
    out.push(node)
    queue.push(...(children.get(node.id) ?? []))
  }
  // Rows in a parent cycle are unreachable from any root; break the cycle by making them roots.
  for (const r of fixed) {
    if (!visited.has(r.id)) {
      orphans++
      out.push({ ...r, parentId: null })
      visited.add(r.id)
    }
  }
  return { rows: out, orphans }
}
