import { ArrowUpIcon, Globe, Paperclip, X, FileIcon, Wrench, ChevronDown, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import TextareaAutosize from 'react-textarea-autosize';
import { useInputStore } from "@/store/input-store";
import { useModelStore } from "@/store/model-store";
import { useRef, useState, useCallback, useEffect } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Attachment, MCPConfig } from "@/page/chat/types";

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
    onCancel?: () => void;
    isLoading?: boolean;
    isStreaming?: boolean;
    placeholder?: string;
    className?: string;
    onHeightChange?: (height: number) => void;
    autoFocus?: boolean;
}

export function ChatInput({
    value,
    onChange,
    onSend,
    onCancel,
    isLoading = false,
    isStreaming = false,
    placeholder,
    className,
    onHeightChange,
    autoFocus = false
}: ChatInputProps) {
    const { t } = useTranslation();
    const selectedTools = useInputStore((state) => state.selectedTools);
    const setSelectedTools = useInputStore((state) => state.setSelectedTools);
    const selectedMcpTools = useInputStore((state) => state.selectedMcpTools);
    const addMcpTool = useInputStore((state) => state.addMcpTool);
    const removeMcpTool = useInputStore((state) => state.removeMcpTool);
    const attachments = useInputStore((state) => state.attachments);
    const addAttachment = useInputStore((state) => state.addAttachment);
    const removeAttachment = useInputStore((state) => state.removeAttachment);
    const currentModel = useModelStore((state) => state.currentModel);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragCounterRef = useRef(0);
    const isComposingRef = useRef(false);

    // MCP configs state
    const [mcpConfigs, setMcpConfigs] = useState<MCPConfig[]>([]);

    // Fetch MCP configs on mount
    useEffect(() => {
        const fetchMcpConfigs = async () => {
            try {
                const result = await api.get<MCPConfig[]>("/api/mcp");
                setMcpConfigs(result?.filter(c => c.is_active && c.tools && c.tools.length > 0) || []);
            } catch (error) {
                console.error("Failed to fetch MCP configs:", error);
            }
        };
        fetchMcpConfigs();
    }, []);

    const handleCompositionStart = () => {
        isComposingRef.current = true;
    };

    const handleCompositionEnd = () => {
        isComposingRef.current = false;
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
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
            const res = await api.post<Attachment>("/api/user/file", formData);

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

    const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    await uploadFile(file);
                }
                return;
            }
        }
    }, [uploadFile]);

    const isToolSelected = (mcpId: string, toolName: string) => {
        return selectedMcpTools.some(t => t.mcp_id === mcpId && t.name === toolName);
    };

    const handleToolToggle = (mcpConfig: MCPConfig, tool: { name: string; description?: string }) => {
        if (isToolSelected(mcpConfig.id, tool.name)) {
            removeMcpTool(mcpConfig.id, tool.name);
        } else {
            addMcpTool({
                mcp_id: mcpConfig.id,
                name: tool.name,
                description: tool.description,
            });
        }
    };

    const totalAvailableTools = mcpConfigs.reduce((acc, config) => acc + (config.tools?.length || 0), 0);

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
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 border border-dashed border-primary rounded-lg backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2 text-primary">
                        <Paperclip className="size-6" />
                        <p className="text-sm font-medium">{t("common.dropFilesHere")}</p>
                        <p className="text-xs text-muted-foreground">{t("common.allowedFileTypes")}</p>
                    </div>
                </div>
            )}
            <InputGroup
                className="rounded-xl"
            >
                <TextareaAutosize
                    data-slot="input-group-control"
                    placeholder={placeholder || t("pages.chat.placeholder")}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onHeightChange={onHeightChange}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    onPaste={handlePaste}
                    disabled={isLoading}
                    maxRows={7}
                    minRows={1}
                    autoFocus={autoFocus}
                    className="flex field-sizing-content w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-base transition-all outline-none md:text-sm"
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
                            {/* MCP Tool Selector */}
                            {totalAvailableTools > 0 && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline">
                                            <Wrench className="size-4" />
                                            <span>{t("components.chatInput.mcpTools")}</span>
                                            <ChevronDown className="size-3 ml-1" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-72" align="start">
                                        {mcpConfigs.map((config, index) => (
                                            <div key={config.id}>
                                                {index > 0 && <DropdownMenuSeparator />}
                                                <DropdownMenuLabel className="text-xs text-muted-foreground">
                                                    {config.name}
                                                </DropdownMenuLabel>
                                                {config.tools?.map((tool) => (
                                                    <DropdownMenuCheckboxItem
                                                        key={`${config.id}-${tool.name}`}
                                                        checked={isToolSelected(config.id, tool.name)}
                                                        onCheckedChange={() => handleToolToggle(config, tool)}
                                                        onSelect={(e) => e.preventDefault()}
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-medium truncate">{tool.name}</div>
                                                            {tool.description && (
                                                                <div className="text-xs text-muted-foreground truncate">
                                                                    {tool.description}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </DropdownMenuCheckboxItem>
                                                ))}
                                            </div>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}

                            {currentModel?.attachment && (
                                <Button
                                    variant="outline"
                                    onClick={handleUploadClick}
                                >
                                    <Paperclip className="size-4" />
                                    {t("common.attachment")}
                                </Button>
                            )}

                            {currentModel?.internal_search && (
                                <ToggleGroupItem
                                    value="internal_web_search"
                                    variant="outline"
                                >
                                    <Globe className={` ${selectedTools.includes("internal_web_search") ? "text-blue-400" : ""}`} />
                                    <p className={` ${selectedTools.includes("internal_web_search") ? "text-blue-400" : ""}`}>{t("common.search")}</p>
                                </ToggleGroupItem>
                            )}
                        </ToggleGroup>

                        {/* Selected MCP Tools and Attachments Display */}
                        {(selectedMcpTools.length > 0 || attachments.length > 0) && (
                            <ScrollArea>
                                <div className="flex gap-2">
                                    {selectedMcpTools.map((tool) => (
                                        <Button key={`${tool.mcp_id}-${tool.name}`} variant="outline" title={tool.name}>
                                            <Wrench className="size-4 opacity-70" />
                                            <span className="truncate max-w-[150px]">{tool.name}</span>
                                            <button
                                                onClick={() => removeMcpTool(tool.mcp_id, tool.name)}
                                                className="text-muted-foreground hover:text-destructive transition-colors"
                                            >
                                                <X className="size-3" />
                                            </button>
                                        </Button>
                                    ))}
                                    {attachments.map((file) => (
                                        <Button key={file.id} variant="outline" title={file.file_name}>
                                            <FileIcon className="size-4 opacity-70" />
                                            <span className="truncate max-w-[150px]">{file.file_name}</span>
                                            <div
                                                onClick={() => removeAttachment(file.id)}
                                                className="text-muted-foreground hover:text-destructive transition-colors"
                                            >
                                                <X className="size-3" />
                                            </div>
                                        </Button>
                                    ))}
                                </div>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                        )}
                    </div>
                    {isStreaming ? (
                        <InputGroupButton
                            variant="destructive"
                            className="rounded-full ml-auto"
                            size="icon-xs"
                            onClick={onCancel}
                            title={t("common.cancel")}
                        >
                            <Square className="size-3" />
                        </InputGroupButton>
                    ) : (
                        <InputGroupButton
                            variant="default"
                            className="rounded-full ml-auto"
                            size="icon-xs"
                            onClick={onSend}
                            disabled={isLoading || (!value.trim() && attachments.length === 0)}
                        >
                            <ArrowUpIcon className="size-3" />
                        </InputGroupButton>
                    )}
                </InputGroupAddon>
            </InputGroup>
        </div>
    );
}
