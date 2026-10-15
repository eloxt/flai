import { UserCheckIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Button } from "~/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty"

export default function ActivationPending() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UserCheckIcon />
        </EmptyMedia>
        <EmptyTitle>{t("pages.activationPending.title")}</EmptyTitle>
        <EmptyDescription>{t("pages.activationPending.description")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button className="w-full" onClick={() => navigate("/login")}>
          {t("pages.activationPending.backToLogin")}
        </Button>
      </EmptyContent>
    </Empty>
  )
}
