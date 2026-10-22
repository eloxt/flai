// Adapted from thesysdev/open-intelligent-ui (MIT): SearchImage in src/lib/components/media.tsx.
import { defineComponent } from "@openuidev/react-lang"
import { ImageIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { useImageSearch } from "~/hooks/use-image-search"
import { useProxiedImages } from "~/hooks/use-proxied-images"

/** The first search result that loads; the proxy fetches it, so the browser never asks the photo host. */
function SearchedPhoto({
  query,
  aspectRatio,
}: {
  query: string
  aspectRatio?: number | null
}) {
  const { t } = useTranslation()
  const alt = typeof query === "string" ? query.trim() : ""
  const found = useImageSearch(alt.length > 2 ? alt : null)
  const [failed, setFailed] = useState<string[]>([])
  const current = found?.find((url) => !failed.includes(url))
  const resolved = useProxiedImages(current ? [current] : []).get(current ?? "")
  // The proxy hook marks a failed download with an empty data URL.
  useEffect(() => {
    if (current && resolved === "data:,")
      setFailed((list) => [...list, current])
  }, [current, resolved])
  const ratio =
    typeof aspectRatio === "number" && aspectRatio > 0.2 && aspectRatio < 5
      ? aspectRatio
      : 1.5
  const shown = current && resolved && resolved !== "data:," ? resolved : null
  const empty = found !== undefined && !current

  return (
    <div
      className="genui-search-image relative grid w-full min-w-0 place-items-center overflow-hidden bg-(--genui-surface)"
      style={{ aspectRatio: ratio }}
      role={shown ? undefined : "img"}
      aria-label={shown ? undefined : alt}
    >
      {shown ? (
        <img
          key={shown}
          src={shown}
          alt={alt}
          className="absolute inset-0 size-full object-cover"
          onError={() => current && setFailed((list) => [...list, current])}
        />
      ) : empty ? (
        <ImageIcon
          aria-hidden
          strokeWidth={1.5}
          className="size-6 text-(--genui-ink) opacity-40"
        />
      ) : null}
      {empty && (
        <span className="sr-only">{t("components.genui.noPhoto")}</span>
      )}
    </div>
  )
}

export const SearchImage = defineComponent({
  name: "SearchImage",
  props: z.object({ query: z.string(), aspectRatio: z.number().optional() }),
  description:
    'A real photo the app finds for query; it needs no URL. Name the exact subject in English in 2 to 4 words: "Belém Tower Lisbon", "pastel de nata". aspectRatio is width / height (default 1.5).',
  component: ({ props }) => (
    <SearchedPhoto query={props.query} aspectRatio={props.aspectRatio} />
  ),
})
