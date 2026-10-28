import type {
  AdminProvider,
  Conversation,
  FileRecord,
  McpServer,
  Memory,
  MemoryEvent,
  MessageRecord,
  Notification,
  PublicShare,
  Share,
  User,
} from '@flai/shared'
import type { schema } from '../db'
import type { MemoryEventRow } from '../services/memories'
import { maskKey, type ProviderRow } from '../services/providers'
import type { UserRow } from './hono'

const iso = (d: Date) => d.toISOString()

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    isActive: row.isActive,
    avatar: row.avatar,
    preferences: row.preferences,
    createdAt: iso(row.createdAt),
  }
}

export function toConversation(row: typeof schema.conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    favourite: row.favourite,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function toMessage(row: typeof schema.messages.$inferSelect): MessageRecord {
  return {
    id: row.id,
    parentId: row.parentId,
    role: row.role,
    parts: row.parts,
    metadata: row.metadata,
    createdAt: iso(row.createdAt),
  }
}

export function toFile(row: typeof schema.files.$inferSelect): FileRecord {
  return { id: row.id, name: row.name, mediaType: row.mediaType, size: row.size, url: row.url, createdAt: iso(row.createdAt) }
}

export function toMcpServer(row: typeof schema.mcpServers.$inferSelect): McpServer {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    headers: row.headers,
    tools: row.tools,
    isActive: row.isActive,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function toMemory(row: typeof schema.userMemories.$inferSelect): Memory {
  return {
    id: row.id,
    content: row.content,
    pinned: row.pinned,
    sourceConversationId: row.sourceConversationId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function toMemoryEvent(row: MemoryEventRow & { undoable: boolean }): MemoryEvent {
  return {
    id: row.id,
    memoryId: row.memoryId,
    action: row.action,
    source: row.source,
    before: row.before,
    after: row.after,
    note: row.note,
    conversationId: row.conversationId,
    createdAt: iso(row.createdAt),
    undoneAt: row.undoneAt ? iso(row.undoneAt) : null,
    undoable: row.undoable,
  }
}

export function toAdminProvider(row: ProviderRow): AdminProvider {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    logo: row.logo,
    models: row.models,
    baseUrl: row.baseUrl,
    apiKey: maskKey(row.apiKey),
    isActive: row.isActive,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function toNotification(row: typeof schema.notifications.$inferSelect): Notification {
  return { id: row.id, title: row.title, content: row.content, level: row.level, createdAt: iso(row.createdAt) }
}

type ShareRow = typeof schema.shares.$inferSelect

export function toShare(row: ShareRow): Share {
  return {
    id: row.id,
    conversationId: row.conversationId,
    title: row.conversation.title,
    icon: row.conversation.icon,
    createdAt: iso(row.createdAt),
    expiresAt: row.expiresAt ? iso(row.expiresAt) : null,
  }
}

export function toPublicShare(row: ShareRow): PublicShare {
  return {
    id: row.id,
    title: row.conversation.title,
    icon: row.conversation.icon,
    messages: row.messages as MessageRecord[],
    createdAt: iso(row.createdAt),
    expiresAt: row.expiresAt ? iso(row.expiresAt) : null,
  }
}
