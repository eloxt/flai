import type { ModelConfig } from '@flai/shared'
import type { z } from 'zod'
import type { ProviderRow } from '../services/providers'
import { chatContext, getChatAgent } from './agent'
import { alertLlmError } from './error-alert'
import { buildModel } from './models'

const TIMEOUT_MS = 2 * 60_000

/** A provider and one of its models. */
export interface ModelTarget {
  provider: ProviderRow
  model: ModelConfig
}

/** Agent options for one request to `target` outside a chat: no tools of its own, the model's default thinking level. */
export function oneShotOptions({ provider, model }: ModelTarget, instructions: string) {
  const built = buildModel({ provider, model })
  return {
    requestContext: chatContext({ model: built.model, instructions }),
    providerOptions: built.providerOptions as never,
  }
}

/** Ask `target` for structured output. Failures are alerted (as `operation`) and rethrown. */
export async function generateStructured<T>(
  operation: string,
  target: ModelTarget,
  { instructions, input, schema }: { instructions: string; input: string; schema: z.ZodType<T> },
): Promise<T> {
  try {
    const result = await getChatAgent().generate(input, {
      ...oneShotOptions(target, instructions),
      structuredOutput: { schema },
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return schema.parse(result.object)
  } catch (error) {
    alertLlmError(operation, target, error)
    throw error
  }
}
