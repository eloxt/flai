import { z } from 'zod'

export const THINKING_LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export const thinkingLevelSchema = z.enum(THINKING_LEVELS)
export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>

export const PROVIDER_TYPES = ['openai', 'openai_completion', 'gemini'] as const
export const providerTypeSchema = z.enum(PROVIDER_TYPES)
export type ProviderType = z.infer<typeof providerTypeSchema>

// Provider-native tools shown as chat toggles. Exa tools are injected globally for tool-calling models.
export const INTERNAL_TOOLS = ['web_search', 'url_context'] as const
export const internalToolSchema = z.enum(INTERNAL_TOOLS)
export type InternalTool = z.infer<typeof internalToolSchema>

export const MODALITIES = ['text', 'audio', 'image', 'video', 'pdf'] as const

const costBaseSchema = z.object({
  input: z.number().nonnegative().default(0),
  output: z.number().nonnegative().default(0),
  cacheRead: z.number().nonnegative().optional(),
  cacheWrite: z.number().nonnegative().optional(),
})
export const modelCostSchema = costBaseSchema.extend({
  contextOver200k: costBaseSchema.optional(),
})

export const modelConfigSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().default(''),
  badge: z.string().optional(),
  family: z.string().optional(),
  status: z.enum(['alpha', 'beta', 'deprecated']).optional(),
  attachment: z.boolean().default(false),
  reasoning: z.boolean().default(false),
  thinkingLevels: z
    .array(thinkingLevelSchema)
    .default([])
    .refine((levels) => new Set(levels).size === levels.length, 'thinking levels must be unique'),
  toolCall: z.boolean().default(false),
  structuredOutput: z.boolean().default(false),
  temperature: z.boolean().default(false),
  openWeights: z.boolean().default(false),
  /** When on, the OpenUI component prompt is injected and assistant replies may contain generative UI. */
  generativeUi: z.boolean().default(false),
  /** Hidden from the model picker; the model stays usable as a title or background model. */
  hidden: z.boolean().default(false),
  knowledge: z.string().optional(),
  releaseDate: z.string().optional(),
  lastUpdated: z.string().optional(),
  modalities: z
    .object({ input: z.array(z.string()).default([]), output: z.array(z.string()).default([]) })
    .default({ input: ['text'], output: ['text'] }),
  cost: modelCostSchema.optional(),
  limit: z
    .object({ context: z.number().int().nonnegative().optional(), output: z.number().int().nonnegative().optional() })
    .optional(),
  internalTools: z.array(internalToolSchema).default([]),
})
export type ModelConfig = z.infer<typeof modelConfigSchema>

/** Provider as returned to normal users (no credentials). */
export interface PublicProvider {
  id: string
  name: string
  type: ProviderType
  logo: string | null
  models: ModelConfig[]
}

/** Provider as returned to admins (api key masked). */
export interface AdminProvider extends PublicProvider {
  baseUrl: string | null
  apiKey: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export const providerInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: providerTypeSchema,
  apiKey: z.string().min(1),
  baseUrl: z.string().trim().url().nullish(),
  logo: z.string().nullish(),
  isActive: z.boolean().default(true),
  models: z
    .array(modelConfigSchema)
    .default([])
    .refine((models) => new Set(models.map((m) => m.id)).size === models.length, 'model ids must be unique'),
})
export type ProviderInput = z.infer<typeof providerInputSchema>
export const providerPatchSchema = providerInputSchema.partial()
export type ProviderPatch = z.infer<typeof providerPatchSchema>

export const providerOrderSchema = z.object({
  ids: z.array(z.string().min(1)).refine((ids) => new Set(ids).size === ids.length, 'provider ids must be unique'),
})

export function defaultThinkingLevel(model: Pick<ModelConfig, 'thinkingLevels'>): ThinkingLevel | undefined {
  return model.thinkingLevels[0]
}
