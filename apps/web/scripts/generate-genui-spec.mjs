import { writeFileSync } from "node:fs"
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib"

// Advertise a small everyday set; the frontend still renders the full library for old replies.
const componentGroups = [
  { name: "Layout", components: ["Stack", "Card", "CardHeader", "Tabs", "TabItem", "Accordion", "AccordionItem", "Separator"] },
  { name: "Content", components: ["TextContent", "Callout", "CodeBlock", "Image", "ImageGallery"] },
  { name: "Data", components: ["Table", "Col", "BarChart", "LineChart", "PieChart", "Series"] },
  {
    name: "Forms",
    components: ["Form", "FormControl", "Input", "TextArea", "Select", "SelectItem", "DatePicker", "CheckBoxGroup", "CheckBoxItem", "RadioGroup", "RadioItem"],
  },
  { name: "Actions", components: ["Button", "Buttons"] },
]
const keep = new Set(componentGroups.flatMap((group) => group.components))
// Removing components through the library also prunes Card/FormControl unions and schemas.
const library = openuiLibrary
  .extend({
    components: { remove: Object.keys(openuiLibrary.components).filter((name) => !keep.has(name)) },
  })
  .toSpec()
const promptOptions = {
  // The remaining official examples cover tables, charts, basic forms and tabs.
  examples: openuiPromptOptions.examples.slice(0, 4),
  additionalRules: [
    'For grid-like layouts, use Stack with direction "row" and wrap=true; avoid large gutters.',
    "Use Tabs or Accordion for alternative views or collapsible details.",
    "For forms, define one FormControl reference per field and always provide Buttons as the second Form argument.",
    "Never nest Form inside Form.",
    "Image URLs must come from the user or tool results; never invent or template image URLs.",
  ],
}

// Keep the backend independent of React while sharing the official component signatures.
writeFileSync(
  new URL("../../../packages/shared/src/genui/openui.spec.json", import.meta.url),
  JSON.stringify({ library: { ...library, componentGroups }, promptOptions }, null, 2) + "\n"
)
