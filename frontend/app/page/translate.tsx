import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MetaFunction } from "react-router";
import { ArrowLeftRight, Loader2, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { useModelStore } from "@/store/model-store";
import type { ContentMessage, StreamResponse } from "@/types/chat";

export const meta: MetaFunction = () => [{ title: "FlaiChat - Translate" }];

interface TranslateRequest {
    provider_id: string;
    model_name: string;
    source_language: string;
    target_language: string;
    text: string;
}

export default function TranslatePage() {
    const { t } = useTranslation();
    const currentModel = useModelStore((state) => state.currentModel);
    const abortControllerRef = useRef<AbortController | null>(null);
    const languageOptions = useMemo(
        () => t("pages.translate.languages", { returnObjects: true }) as string[],
        [t]
    );

    const [sourceLanguage, setSourceLanguage] = useState(t("pages.translate.defaults.source"));
    const [targetLanguage, setTargetLanguage] = useState(t("pages.translate.defaults.target"));
    const [sourceText, setSourceText] = useState("");
    const [translatedText, setTranslatedText] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);

    const setShowHeaderBorder = useAppStore((state) => state.setShowHeaderBorder);
    const setCurrentMessagePath = useAppStore((state) => state.setCurrentMessagePath);

    useEffect(() => {
        setShowHeaderBorder(true);
        setCurrentMessagePath([]);

        return () => {
            abortControllerRef.current?.abort();
        };
    }, [setCurrentMessagePath, setShowHeaderBorder]);

    const stopCurrentStream = useCallback(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setIsStreaming(false);
    }, []);

    const processStream = useCallback(async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.startsWith("data: ")) {
                    continue;
                }

                const dataStr = line.slice(6).trim();
                if (dataStr === "[DONE]") {
                    return;
                }

                try {
                    const streamResponse: StreamResponse = JSON.parse(dataStr);
                    if (streamResponse.type !== "message") {
                        continue;
                    }

                    const data = streamResponse.data as ContentMessage;
                    if (typeof data.content === "string") {
                        setTranslatedText((current) => current + data.content);
                    }
                } catch (error) {
                    console.error("Error parsing translate SSE:", error);
                }
            }
        }
    }, []);

    const handleTranslate = useCallback(async () => {
        const text = sourceText.trim();
        if (!text) {
            toast.error(t("pages.translate.errors.emptyText"));
            return;
        }

        if (!currentModel?.provider_id || !currentModel.id) {
            toast.error(t("common.error.modelProviderNotFound"));
            return;
        }

        stopCurrentStream();
        setTranslatedText("");
        setIsStreaming(true);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const payload: TranslateRequest = {
            provider_id: currentModel.provider_id,
            model_name: currentModel.id,
            source_language: sourceLanguage.trim(),
            target_language: targetLanguage.trim(),
            text,
        };

        try {
            const response = await api.stream("/api/translate", {
                method: "POST",
                body: JSON.stringify(payload),
                signal: abortController.signal,
            });

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error(t("pages.translate.errors.noStream"));
            }

            await processStream(reader);
        } catch (error) {
            if (abortController.signal.aborted) {
                return;
            }
            console.error("Failed to translate:", error);
            toast.error(error instanceof Error ? error.message : t("pages.translate.errors.failed"));
        } finally {
            if (abortControllerRef.current === abortController) {
                abortControllerRef.current = null;
                setIsStreaming(false);
            }
        }
    }, [
        currentModel,
        processStream,
        sourceLanguage,
        sourceText,
        stopCurrentStream,
        t,
        targetLanguage,
    ]);

    const handleSwap = useCallback(() => {
        stopCurrentStream();
        setSourceLanguage(targetLanguage);
        setTargetLanguage(sourceLanguage);
        setSourceText(translatedText);
        setTranslatedText(sourceText);
    }, [sourceLanguage, sourceText, stopCurrentStream, targetLanguage, translatedText]);

    return (
        <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4 py-4 md:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <Languages className="size-5 text-muted-foreground" />
                        <h1 className="text-xl font-medium">{t("pages.translate.title")}</h1>
                    </div>

                    <div className="flex gap-2 sm:justify-end">
                        {isStreaming && (
                            <Button type="button" variant="outline" onClick={stopCurrentStream} className="flex-1 sm:flex-none">
                                {t("pages.translate.stop")}
                            </Button>
                        )}
                        <Button type="button" onClick={handleTranslate} className="flex-1 sm:flex-none">
                            {isStreaming && <Loader2 className="size-4 animate-spin" />}
                            {isStreaming ? t("pages.translate.translating") : t("pages.translate.translate")}
                        </Button>
                    </div>
                </div>

                <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                    <section className="flex min-h-[22rem] flex-col rounded-md border bg-background">
                        <div className="flex items-end gap-3 border-b p-3">
                            <div className="flex-1">
                                <Label className="text-xs text-muted-foreground">
                                    {t("pages.translate.sourceLanguage")}
                                </Label>
                                <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
                                    <SelectTrigger className="mt-1 w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {languageOptions.map((language) => (
                                            <SelectItem key={language} value={language}>
                                                {language}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <Textarea
                            value={sourceText}
                            onChange={(event) => setSourceText(event.target.value)}
                            placeholder={t("pages.translate.sourcePlaceholder")}
                            className="min-h-[18rem] flex-1 resize-none border-0 shadow-none focus-visible:ring-0"
                        />
                    </section>

                    <div className="flex items-center justify-center">
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleSwap}
                            title={t("pages.translate.swap")}
                            className="rounded-full"
                        >
                            <ArrowLeftRight className="size-4" />
                        </Button>
                    </div>

                    <section className="flex min-h-[22rem] flex-col rounded-md border bg-background">
                        <div className="flex items-end gap-3 border-b p-3">
                            <div className="flex-1">
                                <Label className="text-xs text-muted-foreground">
                                    {t("pages.translate.targetLanguage")}
                                </Label>
                                <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                                    <SelectTrigger className="mt-1 w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {languageOptions.map((language) => (
                                            <SelectItem key={language} value={language}>
                                                {language}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <Textarea
                            value={translatedText}
                            onChange={(event) => setTranslatedText(event.target.value)}
                            placeholder={isStreaming ? t("pages.translate.streamingPlaceholder") : t("pages.translate.targetPlaceholder")}
                            className="min-h-[18rem] flex-1 resize-none border-0 shadow-none focus-visible:ring-0"
                        />
                    </section>
                </div>
            </div>
        </div>
    );
}
