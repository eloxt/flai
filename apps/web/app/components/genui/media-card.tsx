import { defineComponent } from "@openuidev/react-lang"
import { ImageIcon } from "lucide-react"
import { z } from "zod"
import { useProxiedImages } from "~/hooks/use-proxied-images"

type MediaCardProps = {
  src: string
  alt: string
  title: string
  text?: string | null
  tags?: string[] | null
  layout?: "vertical" | "horizontal" | null
  aspectRatio?: number | null
}

/** Photo with a title, short text and tags; the image goes through the proxy like every other genui image. */
function MediaCardView({
  src,
  alt,
  title,
  text,
  tags,
  layout,
  aspectRatio,
}: MediaCardProps) {
  const resolved = useProxiedImages(typeof src === "string" ? [src] : []).get(
    src
  )
  const horizontal = layout === "horizontal"
  const ratio =
    typeof aspectRatio === "number" && aspectRatio > 0.2 && aspectRatio < 5
      ? aspectRatio
      : horizontal
        ? 1
        : 1.5
  const failed = resolved === "data:,"
  const labels = Array.isArray(tags)
    ? tags.filter((tag): tag is string => typeof tag === "string" && !!tag)
    : []

  return (
    <div
      className="genui-media-card @container min-w-0"
      data-layout={horizontal ? "horizontal" : "vertical"}
    >
      <div
        className={
          horizontal
            ? "flex items-start gap-3 @sm:gap-4"
            : "flex flex-col gap-3"
        }
      >
        <div
          className={
            horizontal
              ? "relative grid w-1/3 max-w-[200px] shrink-0 place-items-center overflow-hidden bg-(--genui-surface)"
              : "relative grid place-items-center overflow-hidden bg-(--genui-surface)"
          }
          style={{ aspectRatio: ratio }}
        >
          {resolved && !failed ? (
            <img
              src={resolved}
              alt={alt}
              className="absolute inset-0 size-full object-cover"
            />
          ) : failed ? (
            <ImageIcon
              aria-label={alt}
              strokeWidth={1.5}
              className="size-6 opacity-40"
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[20px] leading-tight font-normal">{title}</p>
          {text ? (
            <p className="text-sm leading-relaxed whitespace-pre-line opacity-70">
              {text}
            </p>
          ) : null}
          {labels.length ? (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {labels.map((tag, i) => (
                <li
                  key={`${tag}-${i}`}
                  className="border border-(--genui-line) px-2 py-0.5 text-xs"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export const MediaCard = defineComponent({
  name: "MediaCard",
  props: z.object({
    src: z.string(),
    alt: z.string(),
    title: z.string(),
    text: z.string().optional(),
    tags: z.array(z.string()).optional(),
    layout: z.enum(["vertical", "horizontal"]).optional(),
    aspectRatio: z.number().optional(),
  }),
  description:
    'A photo with a title, one or two sentences and short tags. "vertical" (default) puts the photo on top, for cards side by side in a row Stack or Carousel; "horizontal" puts it beside the text, for lists of places, steps or days. aspectRatio is width / height of the photo (default 1.5, horizontal 1).',
  component: ({ props }) => <MediaCardView {...(props as MediaCardProps)} />,
})
