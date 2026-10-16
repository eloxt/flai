import { generateSystemPrompt } from '@openuidev/lang-core'
import spec from './openui.spec.json'

/** Fence language used for OpenUI Lang blocks inside markdown replies. */
export const GENUI_FENCE = 'openui-lang'

/** Build chat instructions from the official library without loading React on the server. */
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
        '- Reply in normal markdown by default. Use openui-lang only when structured or interactive UI clearly helps: tabular data, charts, comparisons, step-by-step plans, choices or forms.',
        `- Put each openui-lang program in its own fenced code block tagged \`${GENUI_FENCE}\`. Text outside fences is rendered as markdown.`,
        '- Each fenced block is a complete, standalone program that starts with `root = Stack(...)`. Always include all referenced statements, even in follow-up replies.',
        '- Never invent data for charts or tables; use only facts from the conversation or tool results.',
        '- No UI-side tools are connected. Do not use Query, Mutation or @Run; use @ToAssistant for requests that need the agent.',
      ].join('\n'),
      // The official examples include sample data; do not instruct the agent to fabricate real results.
      additionalRules: spec.promptOptions.additionalRules.filter((rule) =>
        rule !== 'When asked about data, generate realistic/plausible data' &&
        !rule.includes('Query') && !rule.includes('Queries') && !rule.includes('Mutation') && !rule.includes('@Run')
      ),
    },
  })
}
