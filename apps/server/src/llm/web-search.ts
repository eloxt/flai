import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { requestExa } from './exa'

/** Search options exposed to the chat model; content extraction is fixed server-side. */
export const webSearchInputSchema = z.object({
  query: z.string().trim().min(1).describe('Natural-language search query.'),
  type: z.enum(['instant', 'fast', 'auto', 'deep-lite', 'deep', 'deep-reasoning']).optional()
    .describe('Default auto. instant/fast for speed; deep-lite for lightweight research; deep for multi-step research; deep-reasoning for complex analysis. Deep modes cost more.'),
  numResults: z.number().int().min(1).max(100).optional().describe('Default 10. Request only as many sources as needed.'),
  additionalQueries: z.array(z.string().trim().min(1)).min(1).max(10).optional().describe('Query variations, only for deep-lite, deep, or deep-reasoning.'),
  category: z.string().min(1).optional().describe('company, publication (scholarly research), news, personal site, financial report, people, or a custom category hint.'),
}).superRefine((input, ctx) => {
  if (input.additionalQueries && !input.type?.startsWith('deep')) {
    ctx.addIssue({ code: 'custom', path: ['additionalQueries'], message: 'Additional queries require a deep search type' })
  }
})

export function createWebSearchTool(apiKey: string) {
  return createTool({
    id: 'web_search',
    title: 'Web search',
    description: [
      'Search the web for any topic and get clean, ready-to-use content. Best for: Finding current information, news, facts, people, companies, or answering questions about any topic. Returns: Clean text content from top search results. Query tips: describe the ideal page, not keywords. "blog post comparing React and Vue performance" not "React vs Vue". Use category:people / category:company to search through Linkedin profiles / companies respectively. If highlights are insufficient, follow up with web_fetch on the best URLs.',
    ].join(' '),
    inputSchema: webSearchInputSchema,
    execute: async (input, context) => {
      // Validate here too: tool adapters may convert Zod to JSON schema and lose cross-field checks.
      const parsed = webSearchInputSchema.parse(input)
      return requestExa('search', {
        type: 'auto', numResults: 10, ...parsed,
        contents: { highlights: true, extras: { links: 3, imageLinks: 3 } },
      }, apiKey, context?.abortSignal)
    },
  })
}
