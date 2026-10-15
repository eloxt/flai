import type { SearchHit } from "@flai/shared"
import { SearchIcon } from "lucide-react"
import { Fragment, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader } from "~/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group"
import { Spinner } from "~/components/ui/spinner"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"

/** Render a snippet whose only markup is <em>…</em>, treating everything else as text. */
function Highlight({ text }: { text: string }) {
  return (
    <>
      {text.split(/(<em>.*?<\/em>)/g).map((chunk, i) =>
        chunk.startsWith("<em>") ? (
          <mark key={i} className="rounded-sm bg-yellow-200/70 px-0.5 text-foreground dark:bg-yellow-500/30">
            {chunk.slice(4, -5)}
          </mark>
        ) : (
          <Fragment key={i}>{chunk}</Fragment>
        )
      )}
    </>
  )
}

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchHit[] | null>(null)
  const [loading, setLoading] = useState(false)

  const search = async () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    try {
      setResults(await api<SearchHit[]>("/search", { query: { q } }))
    } catch (error) {
      notify.error(error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{t("components.sidebar.searchChat")}</DialogTitle>
        </DialogHeader>
        <InputGroup className="h-10">
          <InputGroupAddon>{loading ? <Spinner /> : <SearchIcon />}</InputGroupAddon>
          <InputGroupInput
            autoFocus
            value={query}
            placeholder={t("pages.search.placeholder")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void search()
            }}
          />
        </InputGroup>
        <div className="max-h-[60vh] overflow-y-auto">
          {results?.length === 0 && (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyDescription>{t("common.empty.noResults")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <ul className="flex flex-col gap-1">
            {results?.map((hit) => (
              <li key={hit.conversationId}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => {
                    onOpenChange(false)
                    navigate(`/chat/${hit.conversationId}`)
                  }}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {hit.icon && <span>{hit.icon}</span>}
                    <span className="truncate">{hit.title || t("components.sidebar.untitled")}</span>
                    <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">{new Date(hit.createdAt).toLocaleDateString()}</span>
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    <Highlight text={hit.highlight} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}
