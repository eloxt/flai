import type { z } from 'zod'
import { AppError } from '../lib/errors'
import { resolveModel } from '../services/providers'
import { getSetting } from '../services/settings'
import { generateStructured, type ModelTarget } from './one-shot'

/** The background model, falling back to the title model; null when neither is configured. */
export function backgroundModel(): ModelTarget | null {
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
export async function generateInBackground<T>(operation: string, instructions: string, input: string, schema: z.ZodType<T>): Promise<T> {
  const target = backgroundModel()
  if (!target) throw new AppError('NOT_CONFIGURED', 'No background model is configured')
  return generateStructured(operation, target, { instructions, input, schema })
}
