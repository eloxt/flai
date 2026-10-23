import type { ComponentRenderer, ComponentRenderProps } from "@openuidev/react-lang"
import { MarkDownRenderer, openuiLibrary } from "@openuidev/react-ui"
import { ProxiedImage } from "~/components/proxied-image"
import { useProxiedImages } from "~/hooks/use-proxied-images"
import { genuiExtension } from "./extensions"

/** Image fields can live inside gallery arrays or a card item's nested props. */
function mapImageSources(value: unknown, resolve: (src: string) => string | undefined): unknown {
  if (Array.isArray(value)) return value.map((item) => mapImageSources(item, resolve))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (key === "action") return [key, child]
      if ((key === "src" || key === "bgImageSrc") && typeof child === "string") return [key, resolve(child)]
      return [key, mapImageSources(child, resolve)]
    })
  )
}

function ProxiedComponent({ component: Component, ...input }: ComponentRenderProps & { component: ComponentRenderer }) {
  const sources: string[] = []
  mapImageSources(input.props, (src) => {
    sources.push(src)
    return src
  })
  const images = useProxiedImages(sources)
  return <Component {...input} props={mapImageSources(input.props, (src) => images.get(src)) as Record<string, unknown>} />
}

// Override renderers only: component schemas, card layouts and gallery modals stay official.
export const imageLibrary = openuiLibrary.extend(genuiExtension).extend({
  components: {
    override: [
      ...["Image", "ImageBlock", "ImageText", "ImageTextLarge", "ImageGallery", "VisualCardBlock", "ContextCardBlock", "ListBlock"].map((name) => {
        const definition = openuiLibrary.components[name]!
        return { ...definition, component: (input: ComponentRenderProps) => <ProxiedComponent {...input} component={definition.component} /> }
      }),
      {
        ...openuiLibrary.components.MarkDownRenderer!,
        component: ({ props }) => (
          <MarkDownRenderer
            textMarkdown={props.textMarkdown as string}
            variant={props.variant as "clear" | "card" | "sunk" | undefined}
            options={{ components: { img: ProxiedImage } }}
          />
        ),
      },
    ],
  },
})
