import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { useAuthStore } from "../store/auth-store";
import { useModelStore, Model, Provider } from "../store/model-store";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "./ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";

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
            className="sticky top-0 z-50 bg-background flex items-center justify-start px-4 py-2 gap-2"
        >
            <SidebarTrigger className="md:hidden"/>
            <DropdownMenu onOpenChange={setShowModelMenu}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        disabled={isLoading}
                        className="text-lg font-normal"
                    >
                        {currentModel ? currentModel.name : t("model.select")}
                        <ChevronDown
                            className={`size-4 text-muted-foreground transition-transform duration-200 ${showModelMenu ? "rotate-180" : ""}`}
                        />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-3xs" align="start">
                    {providers.map((provider, index) => (
                        <DropdownMenuGroup key={provider.id}>
                            <DropdownMenuLabel
                                className="font-normal text-neutral-500 flex items-center"
                                key={provider.id}>
                                {provider.logo && (
                                    provider.logo.startsWith("<svg") ? (
                                        <div
                                            className="size-4 mr-2 [&>svg]:w-full [&>svg]:h-full"
                                            dangerouslySetInnerHTML={{ __html: provider.logo }}
                                        />
                                    ) : (
                                        <img
                                            src={provider.logo}
                                            alt={provider.name}
                                            className="size-4 mr-2 object-contain"
                                        />
                                    )
                                )}
                                {provider.name}
                            </DropdownMenuLabel>
                            {provider.model.map((model) => (
                                <HoverCard key={model.id} openDelay={150} closeDelay={150}>
                                    <HoverCardTrigger>
                                        <DropdownMenuCheckboxItem
                                            className="font-normal"
                                            key={model.id}
                                            checked={currentModel?.id === model.id}
                                            onCheckedChange={() => setCurrentModel({ ...model, provider_id: provider.id })}>
                                            {model.name}
                                        </DropdownMenuCheckboxItem>
                                    </HoverCardTrigger>
                                    <HoverCardContent className="min-w-2xs max-w-sm" side="right" align="start" sideOffset={15}>
                                        <ModelCardDetail model={model} />
                                    </HoverCardContent>
                                </HoverCard>
                            ))}
                            {index < providers.length - 1 && <DropdownMenuSeparator />}
                        </DropdownMenuGroup>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
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