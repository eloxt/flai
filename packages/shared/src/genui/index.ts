import { action, createLibrary, defineComponent } from '@openuidev/lang-core'
import { z } from 'zod'

/**
 * Generative UI component catalogue (OpenUI Lang).
 *
 * The schemas live here so the server can build the system prompt and the web app can
 * attach React renderers to exactly the same definitions. Keep descriptions short and
 * concrete: they are copied verbatim into the model prompt.
 */

const tone = z.enum(['default', 'info', 'success', 'warning', 'danger'])

export const genuiProps = {
  Stack: z.object({
    children: z.array(z.any()).describe('Child components'),
    direction: z.enum(['vertical', 'horizontal']).optional().describe('Defaults to vertical'),
  }),
  Card: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    children: z.array(z.any()).optional(),
  }),
  Text: z.object({
    content: z.string().describe('Markdown text'),
  }),
  Callout: z.object({
    tone: tone.optional(),
    title: z.string().optional(),
    content: z.string().describe('Markdown text'),
  }),
  Badges: z.object({
    items: z.array(z.string()),
    tone: tone.optional(),
  }),
  KeyValue: z.object({
    items: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
  Stat: z.object({
    label: z.string(),
    value: z.string(),
    change: z.string().optional().describe('e.g. "+12%"'),
    trend: z.enum(['up', 'down', 'flat']).optional(),
  }),
  Table: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number()]))),
  }),
  Steps: z.object({
    items: z.array(z.object({ title: z.string(), description: z.string().optional() })),
  }),
  BarChart: z.object({
    labels: z.array(z.string()).describe('Category labels on the x axis'),
    series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })),
    stacked: z.boolean().optional(),
  }),
  LineChart: z.object({
    labels: z.array(z.string()).describe('Points on the x axis'),
    series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })),
  }),
  PieChart: z.object({
    slices: z.array(z.object({ label: z.string(), value: z.number() })),
  }),
  Button: z.object({
    label: z.string(),
    action: action().optional().describe('Defaults to sending the label back to the assistant'),
    variant: z.enum(['primary', 'secondary']).optional(),
  }),
  Form: z.object({
    name: z.string().describe('Unique form name'),
    fields: z.array(z.any()).describe('Input, Select or Checkbox components'),
    submitLabel: z.string().optional(),
  }),
  Input: z.object({
    name: z.string(),
    label: z.string(),
    placeholder: z.string().optional(),
    multiline: z.boolean().optional(),
    required: z.boolean().optional(),
  }),
  Select: z.object({
    name: z.string(),
    label: z.string(),
    options: z.array(z.string()),
    required: z.boolean().optional(),
  }),
  Checkbox: z.object({
    name: z.string(),
    label: z.string(),
  }),
} as const

export type GenuiName = keyof typeof genuiProps
export type GenuiProps<N extends GenuiName> = z.infer<(typeof genuiProps)[N]>

export const genuiDescriptions: Record<GenuiName, string> = {
  Stack: 'Lays out children vertically (default) or horizontally.',
  Card: 'A bordered container with an optional title and description.',
  Text: 'A block of markdown text.',
  Callout: 'A highlighted note, tip or warning.',
  Badges: 'A row of short tags.',
  KeyValue: 'A compact list of label/value pairs.',
  Stat: 'A single headline number with an optional change indicator.',
  Table: 'A data table. Each row must have one cell per column.',
  Steps: 'An ordered list of steps or a timeline.',
  BarChart: 'Bar chart comparing values across categories. Each series has one value per label.',
  LineChart: 'Line chart showing values over an ordered axis. Each series has one value per label.',
  PieChart: 'Pie chart of parts of a whole.',
  Button: 'A clickable button that sends a follow-up message or opens a URL.',
  Form: 'Collects user input; on submit the values are sent back to the assistant.',
  Input: 'Text field inside a Form.',
  Select: 'Single-choice dropdown inside a Form.',
  Checkbox: 'Boolean checkbox inside a Form.',
}

export const GENUI_ORDER = Object.keys(genuiProps) as GenuiName[]

/** Build the library with framework-specific renderers (or `null` on the server). */
export function createGenuiLibrary<C>(renderers: Record<GenuiName, C>) {
  return createLibrary<C>({
    root: 'Stack',
    components: GENUI_ORDER.map((name) =>
      defineComponent({
        name,
        props: genuiProps[name],
        description: genuiDescriptions[name],
        component: renderers[name],
      }),
    ),
    componentGroups: [
      { name: 'Layout', components: ['Stack', 'Card', 'Text', 'Callout', 'Badges'] },
      { name: 'Data', components: ['KeyValue', 'Stat', 'Table', 'Steps', 'BarChart', 'LineChart', 'PieChart'] },
      { name: 'Interaction', components: ['Button', 'Form', 'Input', 'Select', 'Checkbox'] },
    ],
  })
}

/** Fence language used for OpenUI Lang blocks inside markdown replies. */
export const GENUI_FENCE = 'openui-lang'

const KEPT_SECTIONS = ['## Syntax Rules', '## Component Signatures', '## Action', '## Hoisting & Streaming', '## Final Verification']

/**
 * System prompt addendum for models with generative UI enabled.
 *
 * The stock lang-core prompt assumes the whole reply is a UI program (or a dashboard being
 * edited). In chat we want markdown first with optional fenced UI blocks, so we keep only the
 * language reference sections and supply our own framing.
 */
export function buildGenuiPrompt(library: { prompt: (options?: { inlineMode?: boolean }) => string }): string {
  const sections = library.prompt({ inlineMode: false }).split(/^(?=## )/m)
  const kept = sections.filter((section) => KEPT_SECTIONS.some((heading) => section.startsWith(heading)))
  return [
    '# Generative UI',
    'You can optionally render rich UI inside your reply using openui-lang, a small declarative UI language.',
    '- Reply in normal markdown by default. Use openui-lang only when structured or interactive UI clearly helps: tabular data, charts, comparisons, step-by-step plans, choices or forms.',
    `- Put each openui-lang program in its own fenced code block tagged \`${GENUI_FENCE}\`. Text outside fences is rendered as markdown.`,
    '- Each fenced block is a complete, standalone program that starts with `root = Stack(...)`.',
    '- Never invent data for charts or tables; use only facts from the conversation or tool results.',
    '',
    ...kept.map((section) => section.trimEnd()),
  ].join('\n')
}
