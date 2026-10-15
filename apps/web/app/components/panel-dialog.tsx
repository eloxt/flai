import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog"
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
          <div className="flex shrink-0 flex-col gap-4 border-b px-4 pt-6 pb-2 md:w-60 md:gap-8 md:border-r md:border-b-0 md:bg-muted md:px-4 md:py-8">
            <DialogTitle className="pr-10 text-2xl font-light tracking-tight md:px-3 md:pr-0">{title}</DialogTitle>
            <TabsList variant="line" className="-mx-4 group-data-horizontal/tabs:h-auto max-w-[calc(100%+2rem)] gap-0 overflow-x-auto px-4 md:mx-0 md:w-full md:max-w-full md:items-stretch md:overflow-visible md:gap-1 md:px-0">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="h-10 flex-none justify-start gap-2 px-3 group-data-vertical/tabs:after:-left-2 group-data-vertical/tabs:after:right-auto">
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
    <div className="overflow-x-auto rounded-lg border [&_td]:px-4 [&_td]:py-3 [&_td]:tabular-nums [&_th]:h-11 [&_th]:px-4 [&_th]:text-xs [&_th]:font-normal [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase">
      {children}
    </div>
  )
}
