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
          <div className="flex shrink-0 flex-col gap-3 border-b p-4 md:w-56 md:border-r md:border-b-0">
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            <TabsList variant="line" className="max-w-full overflow-x-auto md:w-full md:items-stretch">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="justify-start">
                  <tab.icon data-icon="inline-start" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
              <div className="mx-auto flex max-w-3xl flex-col gap-8">{tab.render()}</div>
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
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
