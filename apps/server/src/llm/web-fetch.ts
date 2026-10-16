import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { requestExa } from './exa'

export const webFetchInputSchema = z.object({
  urls: z.array(z.url({ protocol: /^https?$/ }).max(2048)).min(1).max(100)
    .describe('HTTP(S) URLs to read, supplied by the user or found in search results. Fetch only the pages needed, preferably in small batches.'),
})

export function createWebFetchTool(apiKey: string) {
  return createTool({
    id: 'web_fetch',
    title: 'Read web pages',
    description: [
      'Read a webpage\'s full content as clean markdown. Use after web_search when highlights are insufficient or to read any URL. Best for: Extracting full content from known URLs. Batch multiple URLs in one call. Returns: Clean text content and metadata from the page(s).',
      'Images are returned in extras.imageLinks as URL strings. When images help explain the answer, embed 1–3 relevant images across the response using ![brief description](image_url), with a link to the source page nearby. Use only returned image URLs.',
      'Choose images and write captions using source-page context. Do not guess visual details from URLs or claim to have viewed an image from its URL alone. Skip images when relevance is unclear; do not add images to every answer.',
    ].join(' '),
    inputSchema: webFetchInputSchema,
    execute: async (input, context) => {
      const parsed = webFetchInputSchema.parse(input)
      return requestExa('contents', {
        ...parsed, highlights: true, extras: { links: 3, imageLinks: 3 },
      }, apiKey, context?.abortSignal)
    },
  })
}
