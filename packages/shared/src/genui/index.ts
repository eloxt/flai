import { generateSystemPrompt } from '@openuidev/lang-core'
import spec from './openui.spec.json'

/** Fence language used for OpenUI Lang blocks inside markdown replies. */
export const GENUI_FENCE = 'openui-lang'

/** Build chat instructions from the curated component specification without loading React. */
export function buildGenuiPrompt(): string {
  return generateSystemPrompt({
    library: spec.library,
    promptOptions: {
      ...spec.promptOptions,
      bindings: true,
      builtinFunctions: true,
      preamble: [
        '# Generative UI',
        'You can optionally render rich UI inside your reply using openui-lang, a small declarative UI language.',
        '- Reply in normal markdown by default, and answer plain knowledge questions in markdown. Use openui-lang when UI helps more than prose: numbers to adjust or compute, comparisons, choices, step-by-step plans, places or things worth a photo, charts and forms.',
        '- Use only the listed components. Prefer simple cards, text and images over complex nested layouts.',
        `- Put each openui-lang program in its own fenced code block tagged \`${GENUI_FENCE}\`. Text outside fences is rendered as markdown.`,
        '- Each fenced block is a complete, standalone program that starts with `root = Stack(...)`. Always include all referenced statements, even in follow-up replies.',
        '- Never invent data for charts or tables; use only facts from the conversation or tool results.',
        '- No UI-side tools are connected. Do not use Query, Mutation or @Run; use @ToAssistant for requests that need the agent.',
      ].join('\n'),
    },
  })
}
