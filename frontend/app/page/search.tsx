import { Construction } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";

export default function Search() {
    const { t } = useTranslation();
    return (
        <div className="flex h-full w-full items-center justify-center p-4">
            <Empty>
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <Construction className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>{t("pages.search.title")}</EmptyTitle>
                    <EmptyDescription>
                        {t("pages.search.description")}
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        </div>
    );
}