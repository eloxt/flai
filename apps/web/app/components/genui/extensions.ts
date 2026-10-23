import { genuiFunctions } from "@flai/shared/genui/functions"
import { HtmlView } from "./html-view"
import { MediaCard } from "./media-card"
import { Svg, svgComponents } from "./svg"

// Containers that list their children by type; these components join them so they can sit in cards and tabs.
const SLOTS = ["Card.children", "TabItem.content", "AccordionItem.content"]
const slotted = new Set<unknown>([Svg, HtmlView])
// Photo cards also slide in a Carousel.
const MEDIA_SLOTS = [...SLOTS, "Carousel.children"]

/** Additions to the official library, shared by the renderer and the prompt spec. */
export const genuiExtension = {
  components: {
    add: [
      ...[...svgComponents, HtmlView].map((component) =>
        slotted.has(component) ? { component, slots: SLOTS } : component
      ),
      { component: MediaCard, slots: MEDIA_SLOTS },
    ],
  },
  functions: { add: genuiFunctions },
}

export const mediaComponentGroup = {
  name: "Media",
  components: [
    MediaCard.name,
    "Carousel",
    "ListBlock",
    "ListItem",
    HtmlView.name,
  ],
}
