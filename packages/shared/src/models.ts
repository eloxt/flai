import { z } from 'zod'
import type { MessageCostBreakdown, MessageUsage } from './messages'

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
  webSearchCall: z.number().nonnegative().optional(),
})
export type ModelCost = z.infer<typeof modelCostSchema>

/**
 * USD for one reply at per-million-token prices. Cache reads and writes fall back to the input
 * price when the model lists none; prompts over 200k tokens use that tier when it is set.
 */
export function estimateCost(cost: ModelCost, usage: MessageUsage): number | undefined {
  return estimateStepsCost(cost, [usage])
}

/**
 * USD for a reply made of several model calls (tool-use steps). Each call is priced on its own,
 * because providers pick the long-context tier per request, not from the reply's summed input.
 */
export function estimateStepsCost(cost: ModelCost, steps: MessageUsage[]): number | undefined {
  const breakdown = estimateCostBreakdown(cost, steps)
  return breakdown && Object.values(breakdown).reduce((total, amount) => total + amount, 0)
}

export function estimateCostBreakdown(cost: ModelCost, steps: MessageUsage[]): MessageCostBreakdown | undefined {
  const breakdown: MessageCostBreakdown = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, toolInput: 0 }
  let hasUsage = false
  for (const step of steps) {
    const input = step.inputTokens ?? 0
    const output = step.outputTokens ?? 0
    if (!input && !output) continue
    hasUsage = true
    const prices = (input > 200_000 && cost.contextOver200k) || cost
    const cacheRead = step.cachedInputTokens ?? 0
    const cacheWrite = step.cacheWriteTokens ?? 0
    const uncached = Math.max(0, input - cacheRead - cacheWrite)
    const toolInput = Math.min(uncached, step.toolInputTokens ?? 0)
    breakdown.input += (uncached - toolInput) * prices.input / 1_000_000
    breakdown.cacheRead += cacheRead * (prices.cacheRead ?? prices.input) / 1_000_000
    breakdown.cacheWrite += cacheWrite * (prices.cacheWrite ?? prices.input) / 1_000_000
    breakdown.output += output * prices.output / 1_000_000
    breakdown.toolInput += toolInput * prices.input / 1_000_000
  }
  return hasUsage ? breakdown : undefined
}

/** Reconcile older replies to the saved total, using current category prices as weights. */
export function reconstructCostBreakdown(cost: ModelCost, usage: MessageUsage): MessageCostBreakdown | undefined {
  if (usage.cost === undefined) return undefined
  const breakdown = estimateCostBreakdown(cost, [usage])
  if (!breakdown) return undefined

  let weights = breakdown
  let estimate = Object.values(weights).reduce((sum, amount) => sum + amount, 0)
  if (cost.contextOver200k && (usage.inputTokens ?? 0) > 200_000) {
    // A reply that crosses 200k may still consist of individually shorter requests.
    const standard = estimateCostBreakdown({ ...cost, contextOver200k: undefined }, [usage])!
    const standardTotal = Object.values(standard).reduce((sum, amount) => sum + amount, 0)
    if (standardTotal > 0 && Math.abs(standardTotal - usage.cost) < Math.abs(estimate - usage.cost)) {
      weights = standard
      estimate = standardTotal
    }
  }
  if (estimate <= 0) return usage.cost === 0 ? weights : undefined
  return {
    input: usage.cost * (weights.input / estimate),
    output: usage.cost * (weights.output / estimate),
    cacheRead: usage.cost * (weights.cacheRead / estimate),
    cacheWrite: usage.cost * (weights.cacheWrite / estimate),
    toolInput: usage.cost * (weights.toolInput / estimate),
  }
}

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
