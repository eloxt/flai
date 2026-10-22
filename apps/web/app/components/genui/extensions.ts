import { genuiFunctions } from "@flai/shared/genui/functions"
import { HtmlView } from "./html-view"
import { SearchImage } from "./search-image"
import { Svg, svgComponents } from "./svg"

// Containers that list their children by type; these components join them so they can sit in cards and tabs.
const SLOTS = ["Card.children", "TabItem.content", "AccordionItem.content"]
const slotted = new Set<unknown>([Svg, SearchImage, HtmlView])

/** Additions to the official library, shared by the renderer and the prompt spec. */
export const genuiExtension = {
  components: {
    add: [...svgComponents, SearchImage, HtmlView].map((component) =>
      slotted.has(component) ? { component, slots: SLOTS } : component
    ),
  },
  functions: { add: genuiFunctions },
}

export const mediaComponentGroup = {
  name: "Media",
  components: [SearchImage.name, HtmlView.name],
}
