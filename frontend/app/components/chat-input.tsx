import { ArrowUpIcon, Globe, Paperclip, X, FileIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import TextareaAutosize from 'react-textarea-autosize';
import { useInputStore } from "@/store/input-store";
import { useRef, useState, useCallback } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

// Allowed file types: plain text, PDF, and images
const ALLOWED_MIME_TYPES = [
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html',
    'text/css',
    'text/javascript',
    'application/json',
    'application/xml',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
];

const ALLOWED_EXTENSIONS = [
    '.txt', '.md', '.csv', '.html', '.css', '.js', '.ts', '.jsx', '.tsx',
    '.json', '.xml', '.yaml', '.yml', '.log', '.conf', '.cfg', '.ini',
    '.pdf',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
];

function isFileAllowed(file: globalThis.File): boolean {
    // Check MIME type
    if (ALLOWED_MIME_TYPES.includes(file.type)) {
        return true;
    }
    // Check extension as fallback (some text files may not have correct MIME type)
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    return ALLOWED_EXTENSIONS.includes(extension);
}

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    isLoading?: boolean;
    placeholder?: string;
    className?: string;
    onHeightChange?: (height: number) => void;
}

export function ChatInput({
    value,
    onChange,
    onSend,
    isLoading = false,
    placeholder,
    className,
    onHeightChange
}: ChatInputProps) {
    const { t } = useTranslation();
    const selectedTools = useInputStore((state) => state.selectedTools);
    const setSelectedTools = useInputStore((state) => state.setSelectedTools);
    const attachments = useInputStore((state) => state.attachments);
    const addAttachment = useInputStore((state) => state.addAttachment);
    const removeAttachment = useInputStore((state) => state.removeAttachment);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragCounterRef = useRef(0);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const uploadFile = useCallback(async (file: globalThis.File) => {
        if (!isFileAllowed(file)) {
            toast.error(t("common.fileTypeNotAllowed"));
            return;
        }

        const toastId = toast.loading(t("common.uploading"));
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await api.post<File>("/api/user/file", formData);

            addAttachment(res);
            toast.success(t("common.fileUploaded"), { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error(t("common.uploadFailed"), { id: toastId });
        }
    }, [addAttachment, t]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        await uploadFile(file);

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounterRef.current = 0;

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            // Upload all dropped files
            for (const file of Array.from(files)) {
                await uploadFile(file);
            }
        }
    }, [uploadFile]);

    return (
        <div
            className={`flex flex-col w-full gap-2 ${className || ""} relative`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Drag overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 border-1 border-dashed border-primary rounded-lg backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2 text-primary">
                        <Paperclip className="size-6" />
                        <p className="text-sm font-medium">{t("common.dropFilesHere")}</p>
                        <p className="text-xs text-muted-foreground">{t("common.allowedFileTypes")}</p>
                    </div>
                </div>
            )}
            <InputGroup>
                <TextareaAutosize
                    data-slot="input-group-control"
                    placeholder={placeholder || t("pages.chat.placeholder")}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onHeightChange={onHeightChange}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    maxRows={7}
                    minRows={1}
                    className="flex field-sizing-content w-full resize-none rounded-md bg-transparent px-3 py-2.5 text-base transition-all outline-none md:text-sm"
                />
                <InputGroupAddon align="block-end" className="items-end">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                        <ToggleGroup type="multiple" spacing={2} value={selectedTools} onValueChange={setSelectedTools}>
                            <Button
                                variant="outline"
                                onClick={handleUploadClick}
                            >
                                <Paperclip className="size-4" />
                                {t("common.attachment")}
                            </Button>

                            <ToggleGroupItem
                                value="internal_web_search"
                                variant="outline"
                            >
                                <Globe className={` ${selectedTools.includes("internal_web_search") ? "text-blue-400" : ""}`} />
                                <p className={` ${selectedTools.includes("internal_web_search") ? "text-blue-400" : ""}`}>{t("common.search")}</p>
                            </ToggleGroupItem>
                        </ToggleGroup>

                        {attachments.length > 0 && (
                            <ScrollArea>
                                <div className="flex gap-2">
                                    {attachments.map((file) => (
                                        <Button key={file.id} variant="outline">
                                            <FileIcon className="size-4 opacity-70" />
                                            <span className="truncate max-w-[150px]">{file.file_name}</span>
                                            <button
                                                onClick={() => removeAttachment(file.id)}
                                                className="text-muted-foreground hover:text-destructive transition-colors"
                                            >
                                                <X className="size-3" />
                                            </button>
                                        </Button>
                                    ))}
                                </div>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                        )}
                    </div>
                    <InputGroupButton
                        variant="default"
                        className="rounded-full ml-auto"
                        size="icon-xs"
                        onClick={onSend}
                        disabled={isLoading || (!value.trim() && attachments.length === 0)}
                    >
                        <ArrowUpIcon />
                    </InputGroupButton>
                </InputGroupAddon>
            </InputGroup>
        </div>
    );
}
