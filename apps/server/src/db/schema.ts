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
  primaryKey,
  uniqueIndex,
  vector,
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

/** Embedding dimensions; configured models must output (or be truncated to) this many. */
export const EMBEDDING_DIMENSIONS = 1024

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
    /** A few sentences on what the chat covers, kept up to date by the background memory job. */
    summary: text('summary'),
    summaryTsv: tsvector('summary_tsv').generatedAlwaysAs(sql`to_tsvector('zhcfg', coalesce(summary, ''))`),
    /** Messages created up to this time have been summarized and mined for memories. */
    extractedAt: timestamp('extracted_at', { withTimezone: true }),
    /** Set while an instance processes the chat in the background, so others skip it. */
    jobLeaseUntil: timestamp('job_lease_until', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('conversation_user_created_idx').on(t.userId, t.createdAt),
    index('conversation_summary_tsv_idx').using('gin', t.summaryTsv),
  ],
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

/** Embedded slices of a message's search text, for semantic search over a user's chats. */
export const messageChunks = pgTable(
  'message_chunk',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id),
    index: integer('index').notNull(),
    // Denormalized so vector search can filter without joining first.
    userId: text('user_id').notNull(),
    conversationId: text('conversation_id').notNull(),
    /** `providerId:modelId` of the embedding; rows from another model are ignored and replaced. */
    model: text('model').notNull(),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.index] }),
    index('message_chunk_user_idx').on(t.userId),
    index('message_chunk_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
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

/** Short, durable facts about the user, given to the assistant in every chat. */
export const userMemories = pgTable(
  'user_memory',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    content: text('content').notNull(),
    /** The chat the assistant saved it from; null when the user wrote it. */
    sourceConversationId: text('source_conversation_id').references(() => conversations.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('user_memory_user_idx').on(t.userId, t.createdAt)],
)

/** Embedding of a memory's content, used to spot near-duplicates before saving another. */
export const memoryEmbeddings = pgTable('memory_embedding', {
  memoryId: text('memory_id')
    .primaryKey()
    .references(() => userMemories.id, { onDelete: 'cascade' }),
  /** `providerId:modelId`; a row from another model, or for other text, is stale and replaced. */
  model: text('model').notNull(),
  text: text('text').notNull(),
  embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
})

/** Embedding of a conversation's summary, for semantic search over past chats. */
export const summaryEmbeddings = pgTable(
  'summary_embedding',
  {
    conversationId: text('conversation_id')
      .primaryKey()
      .references(() => conversations.id),
    userId: text('user_id').notNull(),
    model: text('model').notNull(),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  },
  (t) => [
    index('summary_embedding_user_idx').on(t.userId),
    index('summary_embedding_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
)
