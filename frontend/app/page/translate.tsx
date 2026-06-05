import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MetaFunction } from "react-router";
import { ArrowLeftRight, Loader2, Languages, ImagePlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { useModelStore } from "@/store/model-store";
import { useTranslateStore } from "@/store/translate-store";
import type { Attachment, ContentMessage, StreamResponse } from "@/types/chat";

export const meta: MetaFunction = () => [{ title: "FlaiChat - Translate" }];

interface TranslateRequest {
    provider_id: string;
    model_name: string;
    source_language: string;
    target_language: string;
    text: string;
    image_ids: string[];
    custom_instruction: string;
}

export default function TranslatePage() {
    const { t } = useTranslation();
    const currentModel = useModelStore((state) => state.currentModel);
    const abortControllerRef = useRef<AbortController | null>(null);
    const languageOptions = useMemo(
        () => t("pages.translate.languages", { returnObjects: true }) as string[],
        [t]
    );

    const storedSourceLanguage = useTranslateStore((state) => state.sourceLanguage);
    const storedTargetLanguage = useTranslateStore((state) => state.targetLanguage);
    const customInstruction = useTranslateStore((state) => state.customInstruction);
    const setSourceLanguage = useTranslateStore((state) => state.setSourceLanguage);
    const setTargetLanguage = useTranslateStore((state) => state.setTargetLanguage);
    const setCustomInstruction = useTranslateStore((state) => state.setCustomInstruction);
    const sourceLanguage = storedSourceLanguage && languageOptions.includes(storedSourceLanguage)
        ? storedSourceLanguage
        : t("pages.translate.defaults.source");
    const targetLanguage = storedTargetLanguage && languageOptions.includes(storedTargetLanguage)
        ? storedTargetLanguage
        : t("pages.translate.defaults.target");

    const [sourceText, setSourceText] = useState("");
    const [translatedText, setTranslatedText] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [images, setImages] = useState<Attachment[]>([]);
    const imageInputRef = useRef<HTMLInputElement>(null);

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

    const uploadImage = useCallback(async (file: File) => {
        if (!file.type.startsWith("image/")) {
            toast.error(t("common.fileTypeNotAllowed"));
            return;
        }
        const toastId = toast.loading(t("common.uploading"));
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await api.post<Attachment>("/api/user/file", formData);
            setImages((prev) => {
                if (prev.length >= 5) return prev;
                return [...prev, res];
            });
            toast.success(t("common.fileUploaded"), { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error(t("common.uploadFailed"), { id: toastId });
        }
    }, [t]);

    const handleImageFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        const remaining = 5 - images.length;
        if (files.length > remaining) {
            toast.error(t("pages.translate.errors.maxImages"));
        }
        const toUpload = Array.from(files).slice(0, Math.max(0, remaining));
        for (const file of toUpload) {
            await uploadImage(file);
        }
        if (imageInputRef.current) {
            imageInputRef.current.value = "";
        }
    }, [images.length, t, uploadImage]);

    const handleSourcePaste = useCallback(async (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of Array.from(items)) {
            if (item.kind === "file" && item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) return;
                if (images.length >= 5) {
                    toast.error(t("pages.translate.errors.maxImages"));
                    return;
                }
                await uploadImage(file);
                return;
            }
        }
    }, [images.length, t, uploadImage]);

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
        if (!text && images.length === 0) {
            toast.error(t("pages.translate.errors.emptyInput"));
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
            image_ids: images.map((i) => i.id),
            custom_instruction: customInstruction.trim(),
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
        customInstruction,
        images,
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
        setImages([]);
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

                <div className="flex flex-col gap-1.5">
                    <Label className="text-sm text-muted-foreground">
                        {t("pages.translate.customInstructionLabel")}
                    </Label>
                    <Input
                        value={customInstruction}
                        onChange={(e) => setCustomInstruction(e.target.value)}
                        placeholder={t("pages.translate.customInstructionPlaceholder")}
                        className="w-full"
                    />
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
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                title={t("pages.translate.addImage")}
                                onClick={() => imageInputRef.current?.click()}
                            >
                                <ImagePlus className="size-4" />
                            </Button>
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={handleImageFileChange}
                            />
                        </div>
                        {images.length > 0 && (
                            <div className="flex flex-wrap gap-2 border-b p-3">
                                {images.map((img) => (
                                    <div key={img.id} className="relative">
                                        <img
                                            src={img.public_url}
                                            alt={img.file_name}
                                            className="size-16 rounded border object-cover"
                                        />
                                        <button
                                            type="button"
                                            title={t("pages.translate.removeImage")}
                                            onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))}
                                            className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-background border text-muted-foreground hover:text-destructive transition-colors"
                                        >
                                            <X className="size-2.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <Textarea
                            value={sourceText}
                            onChange={(event) => setSourceText(event.target.value)}
                            onPaste={handleSourcePaste}
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
