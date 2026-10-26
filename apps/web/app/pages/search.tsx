import type { SearchHit } from "@flai/shared"
import { ArrowUpRightIcon, SearchIcon } from "lucide-react"
import { Fragment, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router"
import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "~/components/ui/input-group"
import { Spinner } from "~/components/ui/spinner"
import { api } from "~/lib/api"

export const links = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous" as const,
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500&display=swap",
  },
]

export default function SearchPage() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const query = (params.get("q") ?? "").trim()
  const [attempt, setAttempt] = useState(0)
  const [response, setResponse] = useState<{
    query: string
    hits: SearchHit[]
    failed: boolean
  } | null>(null)
  const loading = Boolean(query) && response?.query !== query

  useEffect(() => {
    if (!query) return
    const controller = new AbortController()
    api<SearchHit[]>("/search", {
      query: { q: query },
      signal: controller.signal,
    })
      .then((hits) => {
        if (!controller.signal.aborted)
          setResponse({ query, hits, failed: false })
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResponse({ query, hits: [], failed: true })
      })
    return () => controller.abort()
  }, [query, attempt])

  return (
    <main className="min-h-0 flex-1 overflow-y-auto font-['IBM_Plex_Sans',system-ui,sans-serif]">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-12 gap-x-4 gap-y-8 px-4 py-16 md:gap-x-8 md:px-8 md:py-24">
        <header className="col-span-12 flex flex-col gap-4">
          <h1 className="text-title text-4xl leading-tight font-light tracking-tight text-balance sm:text-5xl">
            {t("pages.search.title")}
          </h1>
          <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
            {t("pages.search.description")}
          </p>
        </header>

        <form
          role="search"
          className="col-span-12"
          onSubmit={(event) => {
            event.preventDefault()
            const q = String(
              new FormData(event.currentTarget).get("q") ?? ""
            ).trim()
            setResponse(null)
            if (q === query) setAttempt((value) => value + 1)
            else setParams(q ? { q } : {})
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="search-query" className="sr-only">
                {t("pages.search.title")}
              </FieldLabel>
              <div className="flex flex-col gap-4 sm:flex-row">
                <InputGroup className="h-14 has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 sm:flex-1">
                  <InputGroupAddon className="pl-4">
                    <SearchIcon aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    key={query}
                    id="search-query"
                    type="search"
                    name="q"
                    defaultValue={query}
                    maxLength={200}
                    autoComplete="off"
                    enterKeyHint="search"
                    className="h-full text-base"
                    placeholder={t("pages.search.placeholder")}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        event.nativeEvent.isComposing
                      )
                        event.preventDefault()
                    }}
                  />
                </InputGroup>
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-14 px-8 has-data-[icon=inline-start]:pl-8"
                >
                  {loading ? (
                    <Spinner
                      data-icon="inline-start"
                      aria-hidden="true"
                      className="motion-reduce:animate-none"
                    />
                  ) : (
                    <SearchIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  {t("common.search")}
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </form>

        <section
          className="col-span-12 min-w-0 border-t"
          aria-label={t("pages.search.results")}
          aria-busy={loading}
        >
          <div
            role="status"
            aria-live="polite"
            className="flex min-h-16 items-center text-xs text-muted-foreground tabular-nums"
          >
            {!query
              ? t("pages.search.ready")
              : loading
                ? t("pages.search.searching")
                : response?.failed
                  ? t("pages.search.failed")
                  : t("pages.search.resultCount", {
                      count: response?.hits.length ?? 0,
                    })}
          </div>

          {!query ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>{t("pages.search.emptyTitle")}</EmptyTitle>
                <EmptyDescription>
                  {t("pages.search.emptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : !loading && response?.failed ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>{t("pages.search.failed")}</EmptyTitle>
                <EmptyDescription>
                  {t("pages.search.errorDescription")}
                </EmptyDescription>
              </EmptyHeader>
              <Button
                variant="outline"
                className="min-h-11 px-4"
                onClick={() => {
                  setResponse(null)
                  setAttempt((value) => value + 1)
                }}
              >
                {t("pages.search.retry")}
              </Button>
            </Empty>
          ) : !loading && response?.hits.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>{t("common.empty.noResults")}</EmptyTitle>
                <EmptyDescription>
                  {t("pages.search.noResultsDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            !loading && (
              <ul className="divide-y border-b">
                {response?.hits.map((hit) => (
                  <li key={hit.conversationId}>
                    <Link
                      to={`/chat/${hit.conversationId}`}
                      className="group grid min-h-11 grid-cols-12 items-start gap-x-4 gap-y-2 px-4 py-8 hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:gap-x-8"
                    >
                      <div className="col-span-12 flex min-w-0 flex-col gap-2 sm:col-span-9">
                        <h2 className="flex min-w-0 items-center gap-2 text-lg font-normal sm:text-xl">
                          {hit.icon && (
                            <span aria-hidden="true" className="shrink-0">
                              {hit.icon}
                            </span>
                          )}
                          <span className="truncate">
                            {hit.title || t("components.sidebar.untitled")}
                          </span>
                        </h2>
                        <p className="line-clamp-2 max-w-[60ch] text-sm leading-relaxed break-words text-foreground">
                          {hit.highlight
                            .split(/(<em>.*?<\/em>)/gs)
                            .map((chunk, index) => (
                              <Fragment key={index}>
                                {chunk.startsWith("<em>") ? (
                                  <mark className="rounded-xs bg-foreground/12 text-foreground">
                                    {chunk.slice(4, -5)}
                                  </mark>
                                ) : (
                                  chunk
                                )}
                              </Fragment>
                            ))}
                        </p>
                      </div>
                      <div className="col-span-12 flex items-center gap-4 text-xs text-muted-foreground tabular-nums sm:col-span-3 sm:justify-end sm:pt-1">
                        <time dateTime={hit.createdAt}>
                          {new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                            dateStyle: "medium",
                          }).format(new Date(hit.createdAt))}
                        </time>
                        <ArrowUpRightIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-foreground/40 group-hover:text-foreground"
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          )}
        </section>
      </div>
    </main>
  )
}
