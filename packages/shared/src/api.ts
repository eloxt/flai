import { z } from 'zod'
import { thinkingLevelSchema } from './models'
import type { MessageRecord } from './messages'
import { askUserAnswerSchema } from './messages'

// ---------- errors & pagination ----------

export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION',
  'UNAUTHORIZED',
  'USER_INACTIVE',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'NOT_CONFIGURED',
  'UPSTREAM',
  'UNAVAILABLE',
  'INTERNAL',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown }
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export const pageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ---------- auth & users ----------

export type Role = 'user' | 'admin'

export interface User {
  id: string
  email: string
  username: string
  role: Role
  isActive: boolean
  avatar: string | null
  preferences: Preferences
  createdAt: string
}

export interface Preferences {
  sidebarShowEmoji?: boolean
  /** Let the assistant search and read the user's other chats. Defaults to on. */
  chatHistory?: boolean
  translate?: { source?: string; target?: string; instruction?: string }
  [key: string]: unknown
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  /** Seconds until the access token expires. */
  expiresIn: number
}

export interface AuthResult {
  user: User
  tokens: TokenPair
}

const email = z.string().trim().toLowerCase().email().max(254)
const password = z.string().min(8).max(128)
const username = z.string().trim().min(5).max(20)

export const registerSchema = z.object({ email, username, password })
export const loginSchema = z.object({ email, password: z.string().min(1) })
export const refreshSchema = z.object({ refreshToken: z.string().min(1) })

export const updateMeSchema = z.object({
  username: username.optional(),
  /** File id of an uploaded image, or null to clear. */
  avatarFileId: z.string().nullable().optional(),
})
export const updatePreferencesSchema = z.record(z.string(), z.unknown())
export const changePasswordSchema = z.object({ oldPassword: z.string().min(1), newPassword: password })
export const feedbackSchema = z.object({ content: z.string().trim().min(1).max(2000) })

export const adminCreateUserSchema = z.object({
  email,
  username,
  password,
  role: z.enum(['user', 'admin']).default('user'),
  isActive: z.boolean().default(true),
})
export const adminUpdateUserSchema = z.object({
  email: email.optional(),
  username: username.optional(),
  password: password.optional(),
  role: z.enum(['user', 'admin']).optional(),
  isActive: z.boolean().optional(),
  avatar: z.string().nullable().optional(),
})

// ---------- files ----------

export interface FileRecord {
  id: string
  name: string
  mediaType: string
  size: number
  url: string
  createdAt: string
}

// ---------- conversations ----------

export interface Conversation {
  id: string
  title: string
  icon: string | null
  favourite: boolean
  createdAt: string
  updatedAt: string
}

export interface ActiveGeneration {
  assistantId: string
  /** The message being answered (a user turn or an answered question). */
  parentId: string
}

export interface ConversationDetail extends Conversation {
  messages: MessageRecord[]
  /** A reply still being generated; resume it with `GET /generations/:assistantId/stream`. */
  activeGeneration?: ActiveGeneration | null
}

export const listConversationsQuerySchema = pageQuerySchema.extend({
  favourite: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

export const createConversationSchema = z.object({ title: z.string().trim().max(200).optional() })
export const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  icon: z.string().max(16).nullable().optional(),
  favourite: z.boolean().optional(),
})
export const generateTitleSchema = z.object({ content: z.string().max(20000).optional() })

export interface SearchHit {
  conversationId: string
  messageId: string
  title: string
  icon: string | null
  createdAt: string
  /** Snippet with matches wrapped in <em>…</em>. */
  highlight: string
}

// ---------- chat ----------

export const mcpToolRefSchema = z.object({ serverId: z.string().min(1), name: z.string().min(1) })
export type McpToolRef = z.infer<typeof mcpToolRefSchema>

export const modelRefSchema = z.object({ providerId: z.string().min(1), modelId: z.string().min(1) })
export type ModelRef = z.infer<typeof modelRefSchema>

export const chatOptionsSchema = z.object({
  thinking: thinkingLevelSchema.optional(),
  webSearch: z.boolean().default(false),
  urlContext: z.boolean().default(false),
  mcpTools: z.array(mcpToolRefSchema).max(64).default([]),
})
export type ChatOptions = z.infer<typeof chatOptionsSchema>

const uuid = z.string().uuid()

export const sendMessageSchema = z.object({
  message: z.object({
    id: uuid,
    parentId: z.string().nullable(),
    text: z.string().max(200_000),
    fileIds: z.array(z.string()).max(20).default([]),
  }),
  assistantId: uuid,
  model: modelRefSchema,
  options: chatOptionsSchema.default({ webSearch: false, urlContext: false, mcpTools: [] }),
})
export type SendMessageInput = z.input<typeof sendMessageSchema>

export const regenerateSchema = z.object({
  assistantId: uuid,
  model: modelRefSchema,
  options: chatOptionsSchema.default({ webSearch: false, urlContext: false, mcpTools: [] }),
})
export type RegenerateInput = z.input<typeof regenerateSchema>

export const topicCheckSchema = z.object({
  parentId: z.string().min(1),
  text: z.string().max(200_000),
})
export type TopicCheckInput = z.input<typeof topicCheckSchema>
export interface TopicCheckResult {
  offTopic: boolean
}

export const answerQuestionSchema = z.object({
  assistantId: uuid,
  toolCallId: z.string().min(1),
  answer: askUserAnswerSchema,
})
export type AnswerQuestionInput = z.input<typeof answerQuestionSchema>

export interface AnswerQuestionResult {
  message: MessageRecord
  generation: ActiveGeneration | null
}

export const translateSchema = z.object({
  model: modelRefSchema,
  source: z.string().min(1).max(64),
  target: z.string().min(1).max(64),
  text: z.string().max(50_000).default(''),
  imageFileIds: z.array(z.string()).max(5).default([]),
  instruction: z.string().trim().max(500).optional(),
})
export type TranslateInput = z.input<typeof translateSchema>

// ---------- shares ----------

export interface Share {
  id: string
  conversationId: string
  title: string
  icon: string | null
  createdAt: string
  expiresAt: string | null
}

export interface PublicShare {
  id: string
  title: string
  icon: string | null
  messages: MessageRecord[]
  createdAt: string
  expiresAt: string | null
}

export const createShareSchema = z.object({
  conversationId: z.string().min(1),
  leafMessageId: z.string().min(1),
  expiresAt: z.iso.datetime().nullable().default(null),
})
export const updateShareSchema = z.object({
  expiresAt: z.iso.datetime().nullable().optional(),
  /** Re-snapshot the conversation up to this message. */
  leafMessageId: z.string().min(1).optional(),
})

// ---------- MCP ----------

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpServer {
  id: string
  name: string
  url: string
  headers: Record<string, string>
  tools: McpToolInfo[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export const mcpServerInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.string().trim().url(),
  headers: z.record(z.string(), z.string()).default({}),
  isActive: z.boolean().default(true),
})
export const mcpServerPatchSchema = mcpServerInputSchema.partial()
export const mcpCallSchema = z.object({ arguments: z.record(z.string(), z.unknown()).default({}) })

export interface McpCallResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
  isError: boolean
}

// ---------- notifications ----------

export const NOTIFICATION_LEVELS = ['default', 'warning'] as const
export interface Notification {
  id: string
  title: string
  content: string
  level: (typeof NOTIFICATION_LEVELS)[number]
  createdAt: string
}
export const notificationInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().max(5000).default(''),
  level: z.enum(NOTIFICATION_LEVELS).default('default'),
})

// ---------- settings ----------

const longText = z.string().max(100_000)

export const settingSchemas = {
  web_search: z.object({
    provider: z.enum(['native', 'exa']).default('native'),
    exaApiKey: z.string().trim().max(1000).default(''),
  }),
  system_prompt: z.object({ chat: longText.default(''), translate: longText.default('') }),
  title_generation: z.object({
    providerId: z.string().default(''),
    modelId: z.string().default(''),
    prompt: longText.default(''),
  }),
  /** Embedding model for semantic search over past chats; empty means keyword search only. */
  embedding: z.object({
    providerId: z.string().default(''),
    modelId: z.string().trim().max(200).default(''),
  }),
  /** TypeSafe decision model that asks before a message drifts off the conversation's topic. */
  topic_check: z.object({
    enabled: z.boolean().default(false),
    apiKey: z.string().trim().max(1000).default(''),
    model: z.string().trim().min(1).max(100).default('jev-latest'),
    /** Probability of a topic change at or above which the user is asked. */
    threshold: z.number().min(0.5).max(1).default(0.8),
  }),
  error_alert: z.object({
    barkUrl: z
      .string()
      .trim()
      .refine((v) => v === '' || isSafeHttpUrl(v), 'must be an http(s) URL without credentials or fragment')
      .default(''),
  }),
} as const
export type SettingKey = keyof typeof settingSchemas
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>
export const SETTING_KEYS = Object.keys(settingSchemas) as SettingKey[]

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password && !url.hash
  } catch {
    return false
  }
}
