import type { McpToolInfo, MessageMetadata, ModelConfig, FlaiPart, Preferences, ProviderType } from '@flai/shared'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' })

const id = () => text('id').primaryKey()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
const deletedAt = () => timestamp('deleted_at', { withTimezone: true })

export const users = pgTable(
  'user',
  {
    id: id(),
    email: text('email').notNull(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
    isActive: boolean('is_active').notNull().default(false),
    avatar: text('avatar'),
    preferences: jsonb('preferences').$type<Preferences>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex('user_email_active_unique').on(sql`lower(btrim(${t.email}))`).where(sql`${t.deletedAt} IS NULL`)],
)

export const conversations = pgTable(
  'conversation',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull().default(''),
    icon: text('icon'),
    favourite: boolean('favourite').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('conversation_user_created_idx').on(t.userId, t.createdAt)],
)

export const messages = pgTable(
  'message',
  {
    id: id(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    parentId: text('parent_id').references((): AnyPgColumn => messages.id),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    parts: jsonb('parts').$type<FlaiPart[]>().notNull(),
    metadata: jsonb('metadata').$type<MessageMetadata>().notNull().default({}),
    /** Plain text of the message; maintained by the app, indexed for search. */
    searchText: text('search_text').notNull().default(''),
    tsv: tsvector('tsv').generatedAlwaysAs(sql`to_tsvector('zhcfg', search_text)`),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('message_conversation_idx').on(t.conversationId),
    index('message_parent_idx').on(t.parentId),
    index('message_tsv_idx').using('gin', t.tsv),
  ],
)

export const providers = pgTable('provider', {
  id: id(),
  name: text('name').notNull(),
  type: text('type').$type<ProviderType>().notNull(),
  apiKey: text('api_key').notNull(),
  baseUrl: text('base_url'),
  logo: text('logo'),
  models: jsonb('models').$type<ModelConfig[]>().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
})

export const files = pgTable(
  'file',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    hash: text('hash').notNull(),
    name: text('name').notNull(),
    mediaType: text('media_type').notNull(),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull(),
    url: text('url').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('file_user_idx').on(t.userId, t.createdAt), index('file_hash_idx').on(t.hash)],
)

export interface ShareSnapshot {
  title: string
  icon: string | null
}

export const shares = pgTable(
  'share',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    conversationId: text('conversation_id').notNull(),
    conversation: jsonb('conversation').$type<ShareSnapshot>().notNull(),
    /** Ordered root→leaf snapshot of the shared branch, in MessageRecord shape. */
    messages: jsonb('messages').$type<unknown[]>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('share_user_idx').on(t.userId), index('share_conversation_idx').on(t.conversationId)],
)

export const mcpServers = pgTable(
  'mcp_server',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    url: text('url').notNull(),
    headers: jsonb('headers').$type<Record<string, string>>().notNull().default({}),
    tools: jsonb('tools').$type<McpToolInfo[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('mcp_server_user_idx').on(t.userId)],
)

export const settings = pgTable('setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
})

export const notifications = pgTable('notification', {
  id: id(),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  level: text('level', { enum: ['default', 'warning'] }).notNull().default('default'),
  createdAt: createdAt(),
})
