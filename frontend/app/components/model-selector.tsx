import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { useAuthStore } from "../store/auth-store";
import { useModelStore, Model, Provider } from "../store/model-store";
import { Button } from "@/components/ui/button";
import { Menu, MenuCheckboxItem, MenuGroup, MenuGroupLabel, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { PreviewCard, PreviewCardPopup, PreviewCardTrigger } from "@/components/ui/preview-card";
import { Badge } from "./ui/badge";

interface ModelCardDetailProps {
    model: Model;
}

export default function ModelSelector() {
    const { t } = useTranslation();
    const { currentModel, setCurrentModel } = useModelStore();
    const [providers, setProviders] = useState<Provider[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showModelMenu, setShowModelMenu] = useState(false);

    const tokens = useAuthStore((state) => state.tokens);

    useEffect(() => {
        fetchProviders();
    }, [tokens]);

    const fetchProviders = async () => {
        setIsLoading(true);
        try {
            const data = await api.get<Provider[]>("/api/provider");
            setProviders(data);
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                console.log(error);
                toast.error(t("error.network"));
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <header
            className="flex items-center justify-between px-4 py-2"
        >
            <Menu onOpenChange={setShowModelMenu}>
                <MenuTrigger render={
                    <Button
                        variant="ghost"
                        disabled={isLoading}
                        className="text-lg font-normal"
                    />
                }>
                    {currentModel ? currentModel.name : t("model.select")}
                    <ChevronDown
                        className={`size-4 text-muted-foreground transition-transform duration-200 ${showModelMenu ? "rotate-180" : ""}`}
                    />
                </MenuTrigger>
                <MenuPopup className="w-3xs" align="start">
                    {providers.map((provider, index) => (
                        <MenuGroup key={provider.id}>
                            <MenuGroupLabel
                                className="font-normal text-neutral-500"
                            >{provider.name}
                            </MenuGroupLabel>
                            {provider.model.map((model) => (
                                <PreviewCard key={model.id}>
                                    <PreviewCardTrigger delay={150} closeDelay={150}>
                                        <MenuCheckboxItem
                                            className="font-normal"
                                            key={model.id}
                                            checked={currentModel?.id === model.id}
                                            onCheckedChange={() => setCurrentModel({ ...model, provider_id: provider.id })}>
                                            {model.name}
                                        </MenuCheckboxItem>
                                    </PreviewCardTrigger>
                                    <PreviewCardPopup className="min-w-2xs max-w-sm" align="start" sideOffset={15} side="right">
                                        <ModelCardDetail model={model} />
                                    </PreviewCardPopup>
                                </PreviewCard>
                            ))}
                            {index < providers.length - 1 && <MenuSeparator />}
                        </MenuGroup>
                    ))}
                </MenuPopup>
            </Menu>
        </header>
    );
}

function ModelCardDetail({ model }: ModelCardDetailProps) {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col gap-4 text-xs">
            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <span className="font-medium text-base">{model.name}</span>
                    {model.family && (
                        <span className="text-muted-foreground">{model.family}</span>
                    )}
                </div>
                {model.knowledge && (
                    <div className="text-muted-foreground">
                        {t("model.trainingUntil")}: {model.knowledge}
                    </div>
                )}
            </div>

            <div className="flex flex-wrap gap-2">
                {model.attachment && <Badge variant="secondary">{t("model.badge.attachment")}</Badge>}
                {model.reasoning && <Badge variant="secondary">{t("model.badge.reasoning")}</Badge>}
                {model.tool_call && <Badge variant="secondary">{t("model.badge.toolCall")}</Badge>}
                {model.structured_output && <Badge variant="secondary">{t("model.badge.structuredOutput")}</Badge>}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {model.limit?.context && (
                    <div className="flex flex-col">
                        <span className="text-muted-foreground">{t("model.contextWindow")}</span>
                        <span>{model.limit.context.toLocaleString()}</span>
                    </div>
                )}
                {model.limit?.output && (
                    <div className="flex flex-col">
                        <span className="text-muted-foreground">{t("model.maxOutput")}</span>
                        <span>{model.limit.output.toLocaleString()}</span>
                    </div>
                )}
                {model.cost && (
                    <div className="flex flex-col col-span-2 mt-2">
                        <span className="text-muted-foreground mb-1">{t("model.pricing")}</span>
                        <div className="grid grid-cols-2 gap-x-4">
                            <div>{t("model.input")}: ${model.cost.input}</div>
                            <div>{t("model.output")}: ${model.cost.output}</div>
                        </div>
                    </div>
                )}
            </div>

            {model.modalities && (
                <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground">{t("model.inputModalities")}</span>
                    <div className="flex gap-1 flex-wrap">
                        {model.modalities.input.map(m => (
                            <Badge key={m} variant="outline" className="capitalize">{m}</Badge>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}