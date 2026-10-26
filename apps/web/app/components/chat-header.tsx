import { PanelLeftIcon, Share2Icon } from "lucide-react"
import { lazy, Suspense, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMatch } from "react-router"
import { Button } from "~/components/ui/button"
import { useSidebar } from "~/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { FeedbackDialog } from "./feedback-dialog"
import { ModelSelector } from "./model-selector"

const ShareDialog = lazy(() => import("./share-dialog").then((module) => ({ default: module.ShareDialog })))

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ChatHeader() {
  const { t } = useTranslation()
  const { toggleSidebar, isMobile } = useSidebar()
  const chat = useMatch("/chat/:conversationId")
  const search = useMatch("/search")
  const conversationId = chat?.params.conversationId
  const [shareOpen, setShareOpen] = useState<boolean>()

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-2 md:px-4">
      {/* Equal-width sides centre the model selector on mobile; on desktop it sits at the left. */}
      <div className="flex flex-1 justify-start md:flex-none">
        {isMobile && (
          <HeaderButton
            label={t("components.sidebar.toggle")}
            onClick={toggleSidebar}
          >
            <PanelLeftIcon />
          </HeaderButton>
        )}
      </div>
      {search ? <span className="text-sm text-muted-foreground">{t("components.sidebar.searchChat")}</span> : <ModelSelector />}
      <div className="flex flex-1 items-center justify-end gap-1">
        {conversationId && (
          <>
            <HeaderButton
              label={t("common.shareConversation")}
              onClick={() => setShareOpen(true)}
            >
              <Share2Icon />
            </HeaderButton>
            <FeedbackDialog />
            <Suspense fallback={null}>
              {shareOpen !== undefined && (
                <ShareDialog
                  open={shareOpen}
                  onOpenChange={setShareOpen}
                  conversationId={conversationId}
                />
              )}
            </Suspense>
          </>
        )}
      </div>
    </header>
  )
}
