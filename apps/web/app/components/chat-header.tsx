import { MessageSquareShareIcon, PanelLeftIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMatch } from "react-router"
import { Button } from "~/components/ui/button"
import { useSidebar } from "~/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { useChatStore } from "~/features/chat/chat-store"
import { FeedbackDialog } from "./feedback-dialog"
import { ModelSelector } from "./model-selector"
import { ShareDialog } from "./share-dialog"

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
  const leafId = useChatStore((s) => s.path.at(-1))
  const [shareOpen, setShareOpen] = useState(false)

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
              <MessageSquareShareIcon />
            </HeaderButton>
            <FeedbackDialog />
            <ShareDialog
              open={shareOpen}
              onOpenChange={setShareOpen}
              conversationId={conversationId}
              leafMessageId={leafId}
            />
          </>
        )}
      </div>
    </header>
  )
}
