/**
 * One-off import from the Go flai database into flai-next.
 *
 *   LEGACY_DATABASE_URL=postgres://… DATABASE_URL=postgres://… \
 *     pnpm --filter @flai/server migrate:legacy [--replace] [--timezone=Asia/Shanghai]
 *
 * - Reads the legacy database only (inside a READ ONLY transaction).
 * - Writes everything in one transaction on the target; ids are preserved so share links,
 *   S3 objects and references keep working. Run `db:migrate` on the target first.
 * - Refuses to run against a non-empty target unless --replace is given (which truncates it).
 * - Legacy timestamps have no time zone; they are read in --timezone (default UTC, the
 *   Go server's container default). Set it to the old server's TZ if it was different.
 */
import type { MessageRecord } from '@flai/shared'
import { validateUIMessages } from 'ai'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '../src/db/schema'
import {
  convertAvatar,
  convertMessage,
  convertModel,
  convertPreferences,
  convertShareMessages,
  convertSystemConfig,
  topoSort,
} from '../src/legacy/convert'

const args = new Set(process.argv.slice(2))
const replace = args.has('--replace')
const timezone = [...args].find((a) => a.startsWith('--timezone='))?.split('=')[1] ?? process.env.LEGACY_TIMEZONE ?? 'UTC'

const legacyUrl = process.env.LEGACY_DATABASE_URL
const targetUrl = process.env.DATABASE_URL
if (!legacyUrl || !targetUrl) {
  console.error('LEGACY_DATABASE_URL and DATABASE_URL are required')
  process.exit(1)
}
if (legacyUrl === targetUrl) {
  console.error('Refusing to migrate a database onto itself')
  process.exit(1)
}

const legacy = new pg.Client({ connectionString: legacyUrl })
const targetPool = new pg.Pool({ connectionString: targetUrl })
const target = drizzle(targetPool, { schema, casing: 'snake_case' })

const BATCH = 500

/** Legacy timestamp column → timestamptz using the configured zone. */
const ts = (column: string) => `(${column} AT TIME ZONE '${timezone.replace(/'/g, "''")}')`

async function read<T>(query: string): Promise<T[]> {
  return (await legacy.query(query)).rows as T[]
}

async function insertBatched<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await insert(rows.slice(i, i + BATCH))
}

const report: Array<[string, number, number]> = []
const warnings: string[] = []

async function main() {
  await legacy.connect()
  await legacy.query('BEGIN TRANSACTION READ ONLY')

  const existing = await target.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM "user"`)
  if (Number(existing.rows[0]!.n) > 0 && !replace) {
    throw new Error('Target database already has users. Re-run with --replace to wipe and re-import.')
  }

  const users = await read<{
    id: string; email: string; username: string; password: string; role: string; is_active: number
    created_at: Date; updated_at: Date; deleted_at: Date | null; avatar: Buffer | null; preference: unknown
  }>(`SELECT id, email, username, password, role, is_active, ${ts('created_at')} AS created_at,
        ${ts('updated_at')} AS updated_at, ${ts('deleted_at')} AS deleted_at, avatar, preference FROM "user"`)

  const providers = await read<{
    id: string; name: string; api_key: string; provider_type: string; base_url: string | null; model: unknown
    created_at: Date | null; updated_at: Date | null; deleted_at: Date | null; logo: string | null; is_active: number | null
  }>(`SELECT id, name, api_key, provider_type, base_url, model, ${ts('created_at')} AS created_at,
        ${ts('updated_at')} AS updated_at, ${ts('deleted_at')} AS deleted_at, logo, is_active FROM provider`)

  const conversations = await read<{
    id: string; user_id: string; title: string; icon: string | null; favourite: number | null
    created_at: Date; updated_at: Date; deleted_at: Date | null
  }>(`SELECT id, user_id, title, icon, favourite, ${ts('created_at')} AS created_at,
        ${ts('updated_at')} AS updated_at, ${ts('deleted_at')} AS deleted_at FROM conversation`)

  const messages = await read<{
    id: string; conversation_id: string | null; parent_id: string; role: string; content: unknown
    meta_info: unknown; created_at: Date; deleted_at: Date | null
  }>(`SELECT id, conversation_id, parent_id, role, content, meta_info, ${ts('created_at')} AS created_at,
        ${ts('deleted_at')} AS deleted_at FROM message`)

  const files = await read<{
    id: string; user_id: string; hash: string | null; file_name: string | null; mime_type: string | null
    size: number | null; path: string | null; public_url: string | null; created_at: Date
  }>(`SELECT id, user_id, hash, file_name, mime_type, size, path, public_url, ${ts('created_at')} AS created_at FROM file`)

  const shares = await read<{
    id: string; user_id: string; conversation: unknown; message: unknown
    created_at: Date; deleted_at: Date | null; expires_at: Date | null
  }>(`SELECT id, user_id, conversation, message, ${ts('created_at')} AS created_at,
        ${ts('deleted_at')} AS deleted_at, ${ts('expires_at')} AS expires_at FROM share`)

  const mcps = await read<{
    id: string; user_id: string | null; name: string | null; connection_type: string | null; endpoint: string | null
    headers: unknown; tools: unknown; created_at: Date | null; updated_at: Date | null; deleted_at: Date | null
    is_active: number | null
  }>(`SELECT id, user_id, name, connection_type, endpoint, headers, tools, ${ts('created_at')} AS created_at,
        ${ts('updated_at')} AS updated_at, ${ts('deleted_at')} AS deleted_at, is_active FROM mcp`)

  const systemConfig = await read<{ key: string; value: unknown }>('SELECT key, value FROM system_config')
  await legacy.query('COMMIT')

  const userIds = new Set(users.map((u) => u.id))
  const conversationIds = new Set(conversations.filter((c) => userIds.has(c.user_id)).map((c) => c.id))
  const now = new Date()

  await target.transaction(async (tx) => {
    if (replace) {
      await tx.execute(sql`TRUNCATE "user", conversation, message, provider, file, share, mcp_server, setting, notification CASCADE`)
    }

    // users
    await insertBatched(users, (chunk) =>
      tx.insert(schema.users).values(
        chunk.map((u) => ({
          id: u.id,
          email: u.email.trim().toLowerCase(),
          username: u.username,
          passwordHash: u.password, // bcrypt, verified as-is by bcryptjs
          role: u.role === 'admin' ? ('admin' as const) : ('user' as const),
          isActive: u.is_active === 1,
          avatar: convertAvatar(u.avatar),
          preferences: convertPreferences(u.preference),
          createdAt: u.created_at,
          updatedAt: u.updated_at,
          deletedAt: u.deleted_at,
        })),
      ),
    )
    report.push(['users', users.length, users.length])

    // providers
    let droppedModels = 0
    await insertBatched(providers, (chunk) =>
      tx.insert(schema.providers).values(
        chunk.map((p) => {
          const rawModels = Array.isArray(p.model) ? p.model : []
          const models = rawModels.map(convertModel).filter((m) => m !== undefined)
          droppedModels += rawModels.length - models.length
          const type = (['openai', 'openai_completion', 'gemini'] as const).find((t) => t === p.provider_type)
          if (!type) warnings.push(`provider ${p.id} has unknown type ${p.provider_type}; imported as inactive openai_completion`)
          return {
            id: p.id,
            name: p.name,
            type: type ?? ('openai_completion' as const),
            apiKey: p.api_key,
            baseUrl: p.base_url || null,
            logo: p.logo,
            models,
            isActive: type ? p.is_active === 1 : false,
            createdAt: p.created_at ?? now,
            updatedAt: p.updated_at ?? now,
            deletedAt: p.deleted_at,
          }
        }),
      ),
    )
    if (droppedModels) warnings.push(`${droppedModels} provider model entries were invalid (missing id?) and skipped`)
    report.push(['providers', providers.length, providers.length])

    // conversations
    const keptConversations = conversations.filter((c) => conversationIds.has(c.id))
    await insertBatched(keptConversations, (chunk) =>
      tx.insert(schema.conversations).values(
        chunk.map((c) => ({
          id: c.id,
          userId: c.user_id,
          title: c.title,
          icon: c.icon,
          favourite: c.favourite === 1,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          deletedAt: c.deleted_at,
        })),
      ),
    )
    report.push(['conversations', conversations.length, keptConversations.length])

    // messages (parents first, per conversation)
    const converted = messages
      .filter((m) => m.conversation_id && conversationIds.has(m.conversation_id))
      .map((m) => ({ ...convertMessage(m), conversationId: m.conversation_id!, createdAt: m.created_at, deletedAt: m.deleted_at }))
    const byConversation = new Map<string, typeof converted>()
    for (const m of converted) byConversation.set(m.conversationId, [...(byConversation.get(m.conversationId) ?? []), m])
    const ordered: typeof converted = []
    let orphans = 0
    for (const rows of byConversation.values()) {
      const sorted = topoSort(rows)
      orphans += sorted.orphans
      ordered.push(...sorted.rows)
    }
    if (orphans) warnings.push(`${orphans} messages referenced a missing parent and were attached at the root`)
    let invalid = 0
    for (const m of ordered) {
      if (m.parts.length === 0) continue
      try {
        await validateUIMessages({ messages: [{ id: m.id, role: m.role, parts: m.parts }] })
      } catch (error) {
        invalid++
        if (invalid <= 5) warnings.push(`message ${m.id} failed UI message validation: ${(error as Error).message.slice(0, 200)}`)
      }
    }
    if (invalid > 5) warnings.push(`…${invalid} messages failed validation in total`)
    await insertBatched(ordered, (chunk) => tx.insert(schema.messages).values(chunk))
    report.push(['messages', messages.length, ordered.length])

    // files
    const keptFiles = files.filter((f) => userIds.has(f.user_id) && f.path && f.public_url)
    await insertBatched(keptFiles, (chunk) =>
      tx.insert(schema.files).values(
        chunk.map((f) => ({
          id: f.id,
          userId: f.user_id,
          hash: f.hash ?? '',
          name: f.file_name || 'file',
          mediaType: f.mime_type || 'application/octet-stream',
          size: f.size ?? 0,
          storageKey: f.path!,
          url: f.public_url!,
          createdAt: f.created_at,
        })),
      ),
    )
    report.push(['files', files.length, keptFiles.length])

    // shares
    const keptShares = shares.filter((s) => userIds.has(s.user_id))
    await insertBatched(keptShares, (chunk) =>
      tx.insert(schema.shares).values(
        chunk.map((s) => {
          const conv = (s.conversation ?? {}) as { id?: string; title?: string; icon?: string | null }
          const snapshot: MessageRecord[] = convertShareMessages(s.message)
          return {
            id: s.id,
            userId: s.user_id,
            conversationId: conv.id ?? '',
            conversation: { title: conv.title ?? '', icon: conv.icon ?? null },
            messages: snapshot,
            expiresAt: s.expires_at,
            createdAt: s.created_at,
            deletedAt: s.deleted_at,
          }
        }),
      ),
    )
    report.push(['shares', shares.length, keptShares.length])

    // MCP servers
    const keptMcps = mcps.filter((m) => m.user_id && userIds.has(m.user_id) && m.endpoint)
    await insertBatched(keptMcps, (chunk) =>
      tx.insert(schema.mcpServers).values(
        chunk.map((m) => {
          const isHttp = /^https?:\/\//i.test(m.endpoint!)
          if (!isHttp) warnings.push(`MCP server ${m.id} (${m.connection_type}) is not HTTP; imported as inactive`)
          const tools = (Array.isArray(m.tools) ? m.tools : []).map((t: { name?: string; description?: string; input_schema?: unknown }) => ({
            name: t.name ?? '',
            description: t.description,
            inputSchema: (t.input_schema ?? undefined) as Record<string, unknown> | undefined,
          }))
          return {
            id: m.id,
            userId: m.user_id!,
            name: m.name || 'MCP',
            url: m.endpoint!,
            headers: (m.headers && typeof m.headers === 'object' ? m.headers : {}) as Record<string, string>,
            tools: tools.filter((t) => t.name),
            isActive: isHttp && m.is_active === 1,
            createdAt: m.created_at ?? now,
            updatedAt: m.updated_at ?? now,
            deletedAt: m.deleted_at,
          }
        }),
      ),
    )
    report.push(['mcp servers', mcps.length, keptMcps.length])

    // settings + notifications
    const { settings, notifications } = convertSystemConfig(systemConfig)
    if (settings.length) await tx.insert(schema.settings).values(settings)
    if (notifications.length) await tx.insert(schema.notifications).values(notifications)
    report.push(['settings', systemConfig.length, settings.length])
    report.push(['notifications', notifications.length, notifications.length])
  })

  console.table(report.map(([table, source, imported]) => ({ table, source, imported })))
  for (const w of warnings) console.warn(`warning: ${w}`)
  console.log(`Legacy timestamps were interpreted in time zone ${timezone}.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await legacy.end().catch(() => {})
    await targetPool.end().catch(() => {})
  })
