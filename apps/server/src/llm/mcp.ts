import type { McpCallResult, McpToolInfo, McpToolRef } from '@flai/shared'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { jsonSchema, type Tool, tool } from 'ai'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '../db'
import { AppError } from '../lib/errors'
import { safeFetch } from './safe-fetch'

type McpServerRow = typeof schema.mcpServers.$inferSelect

const CONNECT_TIMEOUT_MS = 30_000
const CALL_TIMEOUT_MS = 120_000

/** fetch() hides the real reason (DNS, SSRF guard, TLS) in `cause`. */
function describe(error: unknown): string {
  const e = error as Error & { cause?: unknown }
  const cause = e?.cause instanceof Error ? e.cause.message : undefined
  return cause && cause !== e.message ? `${e.message}: ${cause}` : (e?.message ?? String(error))
}

async function connect(server: Pick<McpServerRow, 'url' | 'headers'>): Promise<Client> {
  const client = new Client({ name: 'flai-mcp-client', version: '2.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    fetch: safeFetch as typeof fetch,
    requestInit: { headers: server.headers },
  })
  try {
    await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS })
  } catch (error) {
    await client.close().catch(() => {})
    throw new AppError('UPSTREAM', `Could not connect to MCP server: ${describe(error)}`)
  }
  return client
}

async function withClient<T>(server: Pick<McpServerRow, 'url' | 'headers'>, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(server)
  try {
    return await fn(client)
  } finally {
    await client.close().catch(() => {})
  }
}

export async function fetchServerTools(server: Pick<McpServerRow, 'url' | 'headers'>): Promise<McpToolInfo[]> {
  return withClient(server, async (client) => {
    const tools: McpToolInfo[] = []
    let cursor: string | undefined
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: CONNECT_TIMEOUT_MS })
      for (const t of page.tools) {
        tools.push({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown> })
      }
      cursor = page.nextCursor
    } while (cursor)
    return tools
  })
}

function normalizeResult(result: Awaited<ReturnType<Client['callTool']>>): McpCallResult {
  const content = (result.content ?? []) as McpCallResult['content']
  return {
    content: content.map((c) => ({ type: c.type, text: c.text, data: c.data, mimeType: c.mimeType })),
    isError: Boolean(result.isError),
  }
}

export async function callServerTool(
  server: Pick<McpServerRow, 'url' | 'headers'>,
  name: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  return withClient(server, async (client) =>
    normalizeResult(await client.callTool({ name, arguments: args }, { timeout: CALL_TIMEOUT_MS })),
  )
}

/** Only text content is forwarded to the model, matching the previous backend. */
const textOf = (result: McpCallResult) =>
  result.content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text)
    .join('\n')

function toolKey(name: string, taken: Set<string>, serverName: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')
  let key = clean(name).slice(0, 64)
  if (taken.has(key)) key = `${clean(serverName)}_${clean(name)}`.slice(0, 64)
  for (let i = 2; taken.has(key); i++) key = `${clean(name).slice(0, 60)}_${i}`
  taken.add(key)
  return key
}

export interface McpToolset {
  tools: Record<string, Tool>
  close: () => Promise<void>
}

/**
 * Build AI SDK tools for the MCP tools the user selected. Connections are opened lazily on the
 * first call and reused for the rest of the generation.
 */
export async function buildMcpToolset(userId: string, refs: McpToolRef[]): Promise<McpToolset> {
  if (refs.length === 0) return { tools: {}, close: async () => {} }
  const servers = await db
    .select()
    .from(schema.mcpServers)
    .where(
      and(
        eq(schema.mcpServers.userId, userId),
        eq(schema.mcpServers.isActive, true),
        isNull(schema.mcpServers.deletedAt),
        inArray(schema.mcpServers.id, [...new Set(refs.map((r) => r.serverId))]),
      ),
    )

  const clients = new Map<string, Promise<Client>>()
  const clientFor = (server: McpServerRow) => {
    let pending = clients.get(server.id)
    if (!pending) {
      pending = connect(server)
      pending.catch(() => clients.delete(server.id))
      clients.set(server.id, pending)
    }
    return pending
  }

  const tools: Record<string, Tool> = {}
  const taken = new Set<string>()
  for (const ref of refs) {
    const server = servers.find((s) => s.id === ref.serverId)
    const info = server?.tools.find((t) => t.name === ref.name)
    if (!server || !info) continue
    tools[toolKey(info.name, taken, server.name)] = tool({
      title: `${server.name} · ${info.name}`,
      description: info.description ?? info.name,
      inputSchema: jsonSchema((info.inputSchema ?? { type: 'object', properties: {} }) as never),
      execute: async (input: unknown, { abortSignal }) => {
        const client = await clientFor(server)
        const result = normalizeResult(
          await client.callTool(
            { name: info.name, arguments: (input ?? {}) as Record<string, unknown> },
            { timeout: CALL_TIMEOUT_MS, signal: abortSignal },
          ),
        )
        const text = textOf(result)
        if (result.isError) throw new Error(text || 'Tool returned an error')
        return text
      },
    })
  }

  return {
    tools,
    close: async () => {
      await Promise.all(
        [...clients.values()].map((p) => p.then((c) => c.close()).catch(() => {})),
      )
    },
  }
}
