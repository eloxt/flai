import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/db', async () => ({
  schema: await import('../src/db/schema'),
  db: { select: () => ({ from: () => ({ where: async () => [{
    id: 'server', name: 'External', url: 'https://mcp.example.com', headers: {},
    tools: ['web_search', 'web_fetch'].map((name) => ({ name, description: 'External web tool', inputSchema: { type: 'object', properties: {} } })),
  }] }) }) },
}))

import { buildMcpToolset } from '../src/llm/mcp'

describe('MCP tool names', () => {
  it.each(['web_search', 'web_fetch'])('keeps an MCP tool named %s available without shadowing built-in tools', async (name) => {
    const toolset = await buildMcpToolset('alice', [{ serverId: 'server', name }])
    expect(Object.keys(toolset.tools)).toEqual([`External_${name}`])
    expect(toolset.tools[`External_${name}`]!.title).toBe(`External · ${name}`)
    await toolset.close()
  })
})
