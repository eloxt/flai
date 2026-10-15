import type { Conversation, FileRecord, McpServer, MessageRecord, User } from '@flai/shared'
import type { schema } from '../db'
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
