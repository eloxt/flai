import { openuiLibrary } from "@openuidev/react-ui/genui-lib"
import { genuiExtension, mediaComponentGroup } from "./extensions"
import { workingToolExample } from "./prompt-examples"
import { svgComponentGroup } from "./svg"

// Advertise what markdown cannot express; the frontend still renders the full library for old replies.
const componentGroups = [
  {
    name: "Layout",
    components: [
      "Stack",
      "Card",
      "CardHeader",
      "Tabs",
      "TabItem",
      "Accordion",
      "AccordionItem",
      "Steps",
      "StepsItem",
      "Separator",
    ],
  },
  {
    name: "Card grids",
    components: [
      "OverviewCardBlock",
      "OverviewCardItem",
      "SnippetCardBlock",
      "SnippetCardItem",
      "ContextCardBlock",
      "ContextCardItem",
      "Text",
      "BoldText",
      "IconText",
      "MetricIndicatorInline",
    ],
  },
  {
    name: "Content",
    components: [
      "TextContent",
      "Callout",
      "ImageGallery",
      "EntityList",
      "TagBlock",
      "Tag",
      "Icon",
    ],
  },
  {
    name: "Charts",
    components: [
      "BarChart",
      "HorizontalBarChart",
      "LineChart",
      "AreaChart",
      "RadarChart",
      "Series",
      "PieChart",
      "ScatterChart",
      "ScatterSeries",
      "Point",
    ],
  },
  { name: "Tables", components: ["Table", "Col"] },
  {
    name: "Forms",
    components: [
      "Form",
      "FormControl",
      "Input",
      "TextArea",
      "Select",
      "SelectItem",
      "DatePicker",
      "Slider",
      "SwitchGroup",
      "SwitchItem",
      "Chips",
      "ChipItem",
      "OptionCards",
      "OptionCard",
    ],
  },
  { name: "Actions", components: ["Button", "Buttons", "IconButton"] },
  mediaComponentGroup,
  svgComponentGroup,
]

// The renderer keeps these; the prompt leaves them out because rarer ones cost more tokens than they save.
const unlistedFunctions = [
  "Prepend",
  "IndexOf",
  "Reverse",
  "Flatten",
  "Lerp",
  "Pad",
  "Upper",
  "Lower",
  "Trim",
  "Replace",
]

const keep = new Set(componentGroups.flatMap((group) => group.components))
const extended = openuiLibrary.extend(genuiExtension)
// Removing components through the library also prunes Card/FormControl unions and schemas.
export const curatedLibrary = extended.extend({
  components: {
    remove: Object.keys(extended.components).filter((name) => !keep.has(name)),
  },
})

type Spec = ReturnType<typeof curatedLibrary.toSpec>
type Group = { name: string; components: string[]; notes?: string[] }

/** The member list of every `(A | B | ...)[]` child union in a signature. */
function childUnions(signature: string): string[][] {
  return [...signature.matchAll(/\(((?:[A-Z]\w* \| )+[A-Z]\w*)\)\[\]/g)].map(
    (match) => match[1]!.split(" | ")
  )
}

/**
 * Card, TabItem, AccordionItem and Carousel each spell out the same long child
 * union, and nine form inputs repeat the same rules object. Name both once.
 */
function withAliases(spec: Spec, groups: Group[]) {
  const components = spec.components as Record<string, { signature: string }>
  const unions = Object.values(components).flatMap((c) =>
    childUnions(c.signature)
  )
  const block = unions.reduce((shared, union) =>
    shared.filter((name) => union.includes(name))
  )
  const rules = Object.values(components)
    .map((c) => c.signature.match(/rules\?: (\{[^}]*\})/)?.[1])
    .find(Boolean)
  for (const component of Object.values(components)) {
    for (const union of childUnions(component.signature)) {
      if (!block.every((name) => union.includes(name))) continue
      const rest = union.filter((name) => !block.includes(name))
      component.signature = component.signature.replace(
        `(${union.join(" | ")})[]`,
        `(${["Block", ...rest].join(" | ")})[]`
      )
    }
    if (rules)
      component.signature = component.signature.replaceAll(rules, "Rules")
  }
  const notes: Record<string, string> = {
    Layout: `- Block = ${block.join(" | ")}`,
    Forms: `- Rules = ${rules}`,
  }
  return groups.map((group) =>
    notes[group.name]
      ? { ...group, notes: [...(group.notes ?? []), notes[group.name]!] }
      : group
  )
}

const promptOptions = {
  // One working tool for $variables and @functions; static tables and charts belong in markdown.
  examples: [
    `Example — A working tool with state and @functions:\n\n${workingToolExample}`,
  ],
  additionalRules: [
    'For grid-like layouts, use Stack with direction "row" and wrap=true; avoid large gutters.',
    "Never use openui-lang for what markdown already shows well: plain text, lists, code, quotes or a static table. Write those as markdown outside the fence.",
    "Pick the layout from the content instead of defaulting to Tabs: OverviewCardBlock for headline metrics, SnippetCardBlock or EntityList for short facts, ContextCardBlock for tinted notes, Steps for a sequence, a row Stack of Cards to compare side by side, Accordion for optional details. Use Tabs only for two to four genuinely alternative views of the same subject.",
    "Prefer the input that fits the value: Slider for a number in a range, SwitchGroup for on/off settings, Chips for short options, OptionCards for a few rich choices.",
    // Official card-block rules, kept because those blocks are advertised again.
    "Card blocks need at least 2 items, all with the same structure. Text, BoldText, IconText and MetricIndicatorInline go only inside card items.",
    "Always pass a category to Icon — it enables a topical fallback when the exact icon name is unavailable.",
    "Define one FormControl reference per field. Never nest Form inside Form.",
    "When the request involves numbers, choices, lists or steps, make the page a working tool: keep inputs in $variables, compute everything shown from them with expressions and @functions, and change them with @Set, so it works without another message. Every input either changes something shown or sits in a submitted Form.",
    'Use @ToAssistant only for what the page cannot compute: submitting a Form or a new request. Its message is short and first person, as if the user typed it ("Plan my days"); form values are sent with it, so never repeat them.',
    "Input, TextArea and Select values are text: convert with $x * 1 before number @functions, and guard counts with @Clamp(@Default($x * 1, 1), 1, 50) so empty or 0 cannot break the page.",
    "$variable defaults are literals, never expressions or @calls. @Random, @Pick and @Shuffle draw anew on every evaluation, so call them inside @Set.",
    "cond ? a : b also picks between components; there is no @If.",
    'Derive rows once in a statement with @Each(list, "x", {...}), then reuse them in Table, charts, @Sum(rows.field) and @Join.',
    "Format money and percentages with @Format, counts with @Plural and dates with @FormatDate. Relative dates start from @Today(); compare dates with @DaysBetween, since < and > compare numbers only.",
    'Image URLs must come from the user or tool results; never invent them. When the image_search tool is available, call it for a place, dish, product or other thing with a look, naming the exact subject in English ("Belém Tower Lisbon", not "old tower by the sea"), and show a result whose title matches.',
    'To show photos: ImageGallery for several photos of one subject; MediaCard side by side in a row Stack (2 or 3) or a Carousel (more) to compare places, dishes or products; horizontal MediaCard for days, steps or picks with a sentence each; ListBlock with variant "image" for a compact list of named things.',
    "Cards side by side share the same blocks in the same order, the same tags count and the same aspectRatio, so they line up; pick photos of a similar shape from the width and height image_search returns.",
    "Draw with Svg whenever the user would otherwise have to picture how something is built or works: assembly steps, knots, mechanisms, geometry, a room or board layout. A photo shows what a thing looks like; a drawing shows how it works. Keep each simple: a viewBox about 240 wide, a dozen shapes, SvgText labels, driven by $variables such as the current step.",
    "Use HtmlView only for a game or animation that needs a loop; build everything else from components.",
  ],
}

/** The prompt spec the backend reads, without loading React there. */
export function buildGenuiSpec() {
  const library = curatedLibrary.toSpec()
  // Functions have no remove verb, so drop the unlisted ones from the spec.
  library.functions = Object.fromEntries(
    Object.entries(library.functions ?? {}).filter(
      ([name]) => !unlistedFunctions.includes(name)
    )
  )
  return {
    library: {
      ...library,
      componentGroups: withAliases(library, componentGroups),
    },
    promptOptions,
  }
}
