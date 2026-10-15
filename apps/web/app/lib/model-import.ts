import { type ModelConfig, modelConfigSchema } from "@flai/shared"

type Raw = Record<string, unknown>
const isRecord = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v)
const pick = (raw: Raw, ...keys: string[]) => keys.map((k) => raw[k]).find((v) => v !== undefined)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)

function normalizeCost(raw: unknown) {
  if (!isRecord(raw)) return undefined
  return {
    input: num(raw.input) ?? 0,
    output: num(raw.output) ?? 0,
    cacheRead: num(pick(raw, "cache_read", "cacheRead")),
    cacheWrite: num(pick(raw, "cache_write", "cacheWrite")),
  }
}

/** Accept snake_case (models.dev, legacy Flai) or camelCase model definitions. */
export function normalizeModel(raw: Raw): ModelConfig | null {
  const id = String(raw.id ?? raw.name ?? "").trim()
  if (!id) return null
  const tools = new Set<string>((Array.isArray(pick(raw, "internal_tools", "internalTools")) ? (pick(raw, "internal_tools", "internalTools") as string[]) : []))
  const flag = (value: unknown, tool: string) => {
    if (value === true) tools.add(tool)
    if (value === false) tools.delete(tool)
  }
  flag(pick(raw, "internal_search", "internalSearch", "web_search", "webSearch"), "web_search")
  flag(pick(raw, "url_context", "urlContext"), "url_context")
  const cost = isRecord(raw.cost) ? { ...normalizeCost(raw.cost)!, contextOver200k: normalizeCost(pick(raw.cost, "context_over_200k", "contextOver200k")) } : undefined
  const limit = isRecord(raw.limit) ? { context: num(raw.limit.context), output: num(raw.limit.output) } : undefined
  const modalities = isRecord(raw.modalities)
    ? { input: (raw.modalities.input as string[]) ?? [], output: (raw.modalities.output as string[]) ?? [] }
    : undefined
  const parsed = modelConfigSchema.safeParse({
    id,
    name: String(raw.name ?? id),
    badge: raw.badge,
    family: raw.family,
    status: ["alpha", "beta", "deprecated"].includes(String(raw.status)) ? raw.status : undefined,
    attachment: Boolean(raw.attachment),
    reasoning: Boolean(raw.reasoning),
    thinkingLevels: [...new Set((pick(raw, "thinking_levels", "thinkingLevels") as string[] | undefined) ?? [])],
    toolCall: Boolean(pick(raw, "tool_call", "toolCall")),
    structuredOutput: Boolean(pick(raw, "structured_output", "structuredOutput")),
    temperature: Boolean(raw.temperature),
    openWeights: Boolean(pick(raw, "open_weights", "openWeights")),
    generativeUi: Boolean(pick(raw, "generative_ui", "generativeUi")),
    knowledge: raw.knowledge,
    releaseDate: pick(raw, "release_date", "releaseDate"),
    lastUpdated: pick(raw, "last_updated", "lastUpdated"),
    modalities,
    cost,
    limit,
    internalTools: [...tools].filter((t) => t === "web_search" || t === "url_context"),
  })
  return parsed.success ? parsed.data : null
}

/** Extract models from pasted JSON: an array, `{ models: [...] }`, a models.dev provider map, or one model. */
export function extractModels(value: unknown): ModelConfig[] {
  const fromList = (items: unknown[]) =>
    items
      .map((item) => (isRecord(item) ? normalizeModel(item) : typeof item === "string" ? normalizeModel({ id: item }) : null))
      .filter((m): m is ModelConfig => m !== null)
  if (Array.isArray(value)) return fromList(value)
  if (!isRecord(value)) return []
  if (Array.isArray(value.models)) return fromList(value.models)
  if (Array.isArray(value.model)) return fromList(value.model)
  // models.dev style: { models: { "<id>": {...} } } or a bare id→model map.
  const map = isRecord(value.models) ? value.models : value
  if (Object.values(map).every(isRecord) && !("id" in value)) {
    return fromList(Object.entries(map).map(([id, m]) => ({ id, ...(m as Raw) })))
  }
  return fromList([value])
}
