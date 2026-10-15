import { errorMessage } from '../lib/errors'
import { sendBark } from '../services/bark'
import { getSetting } from '../services/settings'

const MAX_LENGTH = 1000

export interface AlertContext {
  operation: string
  providerName?: string
  modelId?: string
  apiKey?: string
}

/** Fire-and-forget Bark alert for failed LLM calls. Never throws. */
export function alertLlmError(ctx: AlertContext, error: unknown): void {
  const { barkUrl } = getSetting('error_alert')
  if (!barkUrl) return
  let message = errorMessage(error)
  if (ctx.apiKey) message = message.replaceAll(ctx.apiKey, '[REDACTED]')
  const body = [
    `操作：${ctx.operation}`,
    `提供商：${ctx.providerName ?? '-'}`,
    `模型：${ctx.modelId ?? '-'}`,
    `错误：${message}`,
  ].join('\n')
  const chars = [...body]
  const truncated = chars.length > MAX_LENGTH ? `${chars.slice(0, MAX_LENGTH).join('')}…` : body
  sendBark(barkUrl, 'Flai LLM 请求报错', truncated).catch((e) => console.warn('error alert failed', e))
}
