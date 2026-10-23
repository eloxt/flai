import { writeFileSync } from "node:fs"
import {
  openuiLibrary,
  openuiPromptOptions,
} from "@openuidev/react-ui/genui-lib"
import {
  genuiExtension,
  mediaComponentGroup,
} from "../app/components/genui/extensions"
import { workingToolExample } from "../app/components/genui/prompt-examples"
import { svgComponentGroup } from "../app/components/genui/svg"

// Advertise a small everyday set; the frontend still renders the full library for old replies.
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
      "Separator",
    ],
  },
  {
    name: "Content",
    components: [
      "TextContent",
      "Callout",
      "CodeBlock",
      "Image",
      "ImageGallery",
    ],
  },
  {
    name: "Data",
    components: ["Table", "Col", "BarChart", "LineChart", "PieChart", "Series"],
  },
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
      "CheckBoxGroup",
      "CheckBoxItem",
      "RadioGroup",
      "RadioItem",
    ],
  },
  { name: "Actions", components: ["Button", "Buttons"] },
  mediaComponentGroup,
  svgComponentGroup,
]
const keep = new Set(componentGroups.flatMap((group) => group.components))
// Removing components through the library also prunes Card/FormControl unions and schemas.
const extended = openuiLibrary.extend(genuiExtension)
const library = extended
  .extend({
    components: {
      remove: Object.keys(extended.components).filter(
        (name) => !keep.has(name)
      ),
    },
  })
  .toSpec()
const promptOptions = {
  // Official table and chart examples, then one working tool for $variables and @functions.
  examples: [
    ...openuiPromptOptions.examples!.slice(0, 2),
    `Example 3 — A working tool with state and @functions:\n\n${workingToolExample}`,
  ],
  additionalRules: [
    'For grid-like layouts, use Stack with direction "row" and wrap=true; avoid large gutters.',
    "Use Tabs or Accordion for alternative views or collapsible details.",
    "For forms, define one FormControl reference per field and always provide Buttons as the second Form argument. Never nest Form inside Form.",
    "When the request involves numbers, choices, lists or steps, make the page a working tool: keep inputs in $variables, compute everything shown from them with expressions and @functions, and change them with @Set, so it works without another message. Every input either changes something shown or sits in a submitted Form.",
    'Use @ToAssistant only for what the page cannot compute: submitting a Form or a new request. Its message is short and first person, as if the user typed it ("Plan my days"); form values are sent with it, so never repeat them.',
    "Input, TextArea and Select values are text: convert with $x * 1 before number @functions, and guard counts with @Clamp(@Default($x * 1, 1), 1, 50) so empty or 0 cannot break the page.",
    "$variable defaults are literals, never expressions or @calls. @Random, @Pick and @Shuffle draw anew on every evaluation, so call them inside @Set.",
    "cond ? a : b also picks between components; there is no @If, and only the listed @functions exist.",
    'Derive rows once in a statement with @Each(list, "x", {...}), then reuse them in Table, charts, @Sum(rows.field) and @Join.',
    "Format money and percentages with @Format, counts with @Plural and dates with @FormatDate. Relative dates start from @Today(); compare dates with @DaysBetween, since < and > compare numbers only.",
    'Image URLs must come from the user or tool results; never invent them. When the image_search tool is available, call it for a place, dish, product or other thing with a look, naming the exact subject in English ("Belém Tower Lisbon", not "old tower by the sea"), and show a result whose title matches.',
    'To show photos: ImageGallery for several photos of one subject; MediaCard side by side in a row Stack (2 or 3) or a Carousel (more) to compare places, dishes or products; horizontal MediaCard for days, steps or picks with a sentence each; ListBlock with variant "image" for a compact list of named things.',
    "Cards side by side share the same blocks in the same order, the same tags count and the same aspectRatio, so they line up; pick photos of a similar shape from the width and height image_search returns.",
    "Draw with Svg whenever the user would otherwise have to picture how something is built or works: assembly steps, knots, mechanisms, geometry, a room or board layout. A photo shows what a thing looks like; a drawing shows how it works. Keep each simple: a viewBox about 240 wide, a dozen shapes, SvgText labels, driven by $variables such as the current step.",
    "Use HtmlView only for a game or animation that needs a loop; build everything else from components.",
  ],
}

// Keep the backend independent of React while sharing the official component signatures.
writeFileSync(
  new URL(
    "../../../packages/shared/src/genui/openui.spec.json",
    import.meta.url
  ),
  JSON.stringify(
    { library: { ...library, componentGroups }, promptOptions },
    null,
    2
  ) + "\n"
)
