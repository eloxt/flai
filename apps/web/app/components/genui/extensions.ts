import { genuiFunctions } from "@flai/shared/genui/functions"
import { Svg, svgComponents } from "./svg"

// Containers that list their children by type; Svg joins them so drawings can sit in cards and tabs.
const SVG_SLOTS = ["Card.children", "TabItem.content", "AccordionItem.content"]

/** Additions to the official library, shared by the renderer and the prompt spec. */
export const genuiExtension = {
  components: {
    add: svgComponents.map((component) =>
      component === Svg ? { component, slots: SVG_SLOTS } : component
    ),
  },
  functions: { add: genuiFunctions },
}
