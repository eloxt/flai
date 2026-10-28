import type { z } from 'zod'
import { AppError } from '../lib/errors'
import { resolveModel } from '../services/providers'
import { getSetting } from '../services/settings'
import { chatContext, getChatAgent } from './agent'
import { alertLlmError } from './error-alert'
import { buildModel } from './models'

const MODEL_TIMEOUT_MS = 2 * 60_000

/** The background model, falling back to the title model; null when neither is configured. */
export function backgroundModel() {
  const own = getSetting('background_model')
  const { providerId, modelId } = own.providerId && own.modelId ? own : getSetting('title_generation')
  if (!providerId || !modelId) return null
  try {
    return resolveModel(providerId, modelId)
  } catch {
    return null
  }
}

/** Ask the background model for structured output; failures are alerted and rethrown. */
export async function generateStructured<T>(operation: string, instructions: string, input: string, schema: z.ZodType<T>): Promise<T> {
  const resolved = backgroundModel()
  if (!resolved) throw new AppError('NOT_CONFIGURED', 'No background model is configured')
  const { provider, model } = resolved
  const built = buildModel({ provider, model, options: { thinking: model.thinkingLevels[0] } })
  try {
    const result = await getChatAgent().generate(input, {
      requestContext: chatContext({ model: built.model, instructions }),
      providerOptions: built.providerOptions as never,
      structuredOutput: { schema },
      abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    })
    return schema.parse(result.object)
  } catch (error) {
    alertLlmError({ operation, providerName: provider.name, modelId: model.id, apiKey: provider.apiKey }, error)
    throw error
  }
}
