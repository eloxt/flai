import { writeFileSync } from "node:fs"
import {
  openuiLibrary,
  openuiPromptOptions,
} from "@openuidev/react-ui/genui-lib"
import {
  genuiExtension,
  mediaComponentGroup,
} from "../app/components/genui/extensions"
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
  // The remaining official examples cover tables, charts, basic forms and tabs.
  examples: openuiPromptOptions.examples!.slice(0, 4),
  additionalRules: [
    'For grid-like layouts, use Stack with direction "row" and wrap=true; avoid large gutters.',
    "Use Tabs or Accordion for alternative views or collapsible details.",
    "For forms, define one FormControl reference per field and always provide Buttons as the second Form argument.",
    "Never nest Form inside Form.",
    "Image URLs must come from the user or tool results; never invent or template image URLs. For a photo of a place, dish, product or other thing with a look, use SearchImage with an English query instead.",
    "When the request involves numbers, lists or steps, keep inputs in $variables and compute what is shown with the listed @functions, so the page works without another message. Change state with @Set.",
    "$variable defaults are literals, never expressions or @calls. @Random, @Pick and @Shuffle draw anew on every evaluation, so call them inside @Set.",
    "Use Svg drawings for how something is built or works: assembly steps, mechanisms, geometry, layouts. Keep each simple: a viewBox about 240 wide, a dozen shapes, SvgText labels.",
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
