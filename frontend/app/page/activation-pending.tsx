import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

export default function ActivationPending() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    return (
        <div className="w-full max-w-sm">
            <Empty>
                <EmptyMedia>
                    <UserCheck className="size-10" />
                </EmptyMedia>
                <EmptyHeader>
                    <EmptyTitle>{t("pages.activationPending.title")}</EmptyTitle>
                    <EmptyDescription>
                        {t("pages.activationPending.description")}
                    </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Button
                        className="w-full"
                        onClick={() => navigate("/login")}
                    >
                        {t("pages.activationPending.backToLogin")}
                    </Button>
                </EmptyContent>
            </Empty>
        </div>
    );
}