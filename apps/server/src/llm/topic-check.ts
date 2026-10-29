import { type SettingValue, textOf } from '@flai/shared'
import { z } from 'zod'
import { AppError, upstreamError } from '../lib/errors'
import { clip } from '../lib/text'
import type { MessageRow } from '../services/conversations'
import { getSetting } from '../services/settings'

/** The check sits in front of every send, so a slow answer counts as "on topic". */
const CHECK_TIMEOUT_MS = 5000
const MAX_TURNS = 8
const MAX_TURN_CHARS = 2000
const MAX_MESSAGE_CHARS = 4000

const responseSchema = z.object({
  answers: z.object({ topic_shift: z.object({ noul: z.number() }) }),
})

const TYPESAFE_ERRORS: Record<number, string> = {
  401: 'Invalid TypeSafe API key', 403: 'TypeSafe access denied', 422: 'Invalid TypeSafe request',
  429: 'TypeSafe rate limit exceeded; try again later', 529: 'TypeSafe is overloaded; try again later',
}

type Connection = Pick<SettingValue<'topic_check'>, 'baseUrl' | 'apiKey'>

async function requestTypeSafe(path: string, { baseUrl, apiKey }: Connection, init: RequestInit & { signal: AbortSignal }) {
  const response = await fetch(`${baseUrl}/v1${path}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
  }).catch(() => {
    throw new AppError('UPSTREAM', init.signal.aborted ? 'TypeSafe request timed out' : 'Could not reach TypeSafe')
  })
  if (!response.ok) throw await upstreamError(response, TYPESAFE_ERRORS, 'TypeSafe service unavailable')
  return response.json() as Promise<unknown>
}

const modelsSchema = z.object({ models: z.array(z.object({ name: z.string() })) })

/** Fail on save rather than silently skipping every check later. */
export async function verifyTypeSafe(connection: Connection, model: string): Promise<void> {
  const result = modelsSchema.safeParse(await requestTypeSafe('/models', connection, { method: 'GET', signal: AbortSignal.timeout(15_000) }))
  if (!result.success) throw new AppError('UPSTREAM', 'TypeSafe returned an invalid response')
  if (!result.data.models.some((m) => m.name === model)) throw new AppError('BAD_REQUEST', `TypeSafe model not found: ${model}`)
}

/** Probability that `text` starts a topic unrelated to the conversation ending at `path`. */
export async function topicShift(settings: SettingValue<'topic_check'>, title: string, path: MessageRow[], text: string): Promise<number> {
  const conversation = path
    .map((m) => ({ role: m.role, text: clip(textOf(m.parts).trim(), MAX_TURN_CHARS) }))
    .filter((m) => m.text)
    .slice(-MAX_TURNS)
  if (conversation.length === 0) return 0
  const data = await requestTypeSafe('/systemone', settings, {
    method: 'POST',
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    body: JSON.stringify({
      model: settings.model,
      state: { conversation_title: title, conversation, new_message: clip(text, MAX_MESSAGE_CHARS) },
      questions: {
        topic_shift: {
          type: 'noul',
          instructions: 'The `new_message` starts a new subject that is unrelated to the `conversation`.',
          criteria: {
            true: 'An unrelated subject that would make sense as the first message of a fresh chat.',
            false: 'Continues, follows up on, refines, or refers back to the conversation, including short replies such as "thanks", "more detail", "why?" or "try again".',
          },
        },
      },
    }),
  })
  const result = responseSchema.safeParse(data)
  if (!result.success) throw new AppError('UPSTREAM', 'TypeSafe returned an invalid response')
  return result.data.answers.topic_shift.noul
}

/** Whether to ask the user before sending; any failure lets the message through. */
export async function isOffTopic(title: string, path: MessageRow[], text: string): Promise<boolean> {
  const settings = getSetting('topic_check')
  if (!settings.enabled || !settings.apiKey || !text.trim()) return false
  try {
    return (await topicShift(settings, title, path, text)) >= settings.threshold
  } catch (error) {
    console.warn('topic check failed', error instanceof Error ? error.message : error)
    return false
  }
}
