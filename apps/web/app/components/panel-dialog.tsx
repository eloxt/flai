import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { useIsMobile } from "~/hooks/use-mobile"

export interface PanelTab {
  id: string
  label: string
  icon: LucideIcon
  render: () => ReactNode
}

interface PanelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  tabs: PanelTab[]
}

// Rail tabs mirror the app sidebar's conversation rows: same size, hover and raised active state.
const PANEL_TAB =
  "h-8 flex-none justify-start gap-2 rounded-md border-0 p-2 font-normal text-sidebar-foreground after:hidden hover:bg-sidebar-accent data-active:bg-card data-active:text-sidebar-foreground data-active:shadow-xs! dark:text-sidebar-foreground dark:data-active:bg-card"

/** Large settings-style dialog: tab list on the left (top on mobile), content on the right. */
export function PanelDialog({ open, onOpenChange, title, tabs }: PanelDialogProps) {
  const isMobile = useIsMobile()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88dvh,820px)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <Tabs
          defaultValue={tabs[0]?.id}
          orientation={isMobile ? "horizontal" : "vertical"}
          className="flex min-h-0 flex-1 flex-col gap-0 md:flex-row"
        >
          <div className="flex shrink-0 flex-col gap-4 border-b px-4 pt-6 pb-2 md:w-60 md:gap-8 md:border-r md:border-b-0 md:bg-sidebar md:px-2 md:py-8">
            <DialogTitle className="text-title pr-10 text-2xl font-light tracking-tight md:px-2 md:pr-0">{title}</DialogTitle>
            <TabsList className="-mx-4 group-data-horizontal/tabs:h-auto max-w-[calc(100%+2rem)] gap-1 overflow-x-auto rounded-none bg-transparent px-4 py-1 md:mx-0 md:w-full md:max-w-full md:items-stretch md:overflow-visible md:p-0">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className={PANEL_TAB}>
                  <tab.icon data-icon="inline-start" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="min-h-0 flex-1 overflow-y-auto px-4 py-8 md:px-12 md:py-12">
              <div className="mx-auto flex max-w-3xl flex-col gap-12 [&>section+section]:border-t [&>section+section]:pt-12">{tab.render()}</div>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/** Section heading used inside panel tabs. */
export function PanelSection({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="text-xl leading-snug font-normal tracking-tight text-balance">{title}</h3>
          {description && <p className="max-w-[60ch] text-sm text-pretty text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/** Bordered, horizontally scrollable table with roomy cells, for lists inside panel tabs. */
export function PanelTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-(--highlight) [&_td]:px-4 [&_td]:py-3 [&_td]:tabular-nums [&_th]:h-11 [&_th]:px-4 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
      {children}
    </div>
  )
}

/** Shown in place of a panel's content when it could not be loaded. */
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <Empty className="bg-muted shadow-(--sunken)">
      <EmptyHeader>
        <EmptyDescription>{t("common.empty.loadFailed")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onRetry}>
          {t("common.actions.retry")}
        </Button>
      </EmptyContent>
    </Empty>
  )
}

/** A panel's list: a placeholder while it loads, a retry when that failed, a note when it is empty. */
export function PanelList<T>({
  items,
  failed,
  onRetry,
  tall = false,
  emptyHint,
  children,
}: {
  items: T[] | null
  failed: boolean
  onRetry: () => void
  /** Use a taller placeholder, for lists that are rarely short. */
  tall?: boolean
  emptyHint?: string
  children: (items: T[]) => ReactNode
}) {
  const { t } = useTranslation()
  if (failed) return <LoadFailed onRetry={onRetry} />
  if (items === null) return <Skeleton className={tall ? "h-40 w-full" : "h-28 w-full"} />
  if (items.length === 0) {
    return (
      <Empty className="bg-muted shadow-(--sunken)">
        <EmptyHeader>
          <EmptyTitle>{t("common.empty.noItems")}</EmptyTitle>
          {emptyHint && <EmptyDescription>{emptyHint}</EmptyDescription>}
        </EmptyHeader>
      </Empty>
    )
  }
  return children(items)
}
