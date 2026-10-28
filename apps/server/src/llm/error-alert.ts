import { errorMessage, redactSecret } from '../lib/errors'
import { sendBark } from '../services/bark'
import { getSetting } from '../services/settings'
import type { ModelTarget } from './one-shot'

const MAX_LENGTH = 1000

/** Fire-and-forget Bark alert for a failed LLM call. Never throws. */
export function alertLlmError(operation: string, { provider, model }: ModelTarget, error: unknown): void {
  const { barkUrl } = getSetting('error_alert')
  if (!barkUrl) return
  const body = [
    `操作：${operation}`,
    `提供商：${provider.name}`,
    `模型：${model.id}`,
    `错误：${redactSecret(errorMessage(error), provider.apiKey)}`,
  ].join('\n')
  const chars = [...body]
  const truncated = chars.length > MAX_LENGTH ? `${chars.slice(0, MAX_LENGTH).join('')}…` : body
  sendBark(barkUrl, 'Flai LLM 请求报错', truncated).catch((e) => console.warn('error alert failed', e))
}
