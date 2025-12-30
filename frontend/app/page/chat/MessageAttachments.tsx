import { useState } from "react";
import { FileIcon } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/utils";
import type { File } from "./types";

interface MessageAttachmentsProps {
    files: File[];
}

function ImageWithSpinner({ file }: { file: File }) {
    const [isLoading, setIsLoading] = useState(true);

    return (
        <div className="relative h-48 min-w-[192px] flex items-center justify-center">
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-lg border border-border">
                    <Spinner className="size-6 text-muted-foreground" />
                </div>
            )}
            <img
                src={file.public_url}
                alt={file.file_name}
                className={`h-48 w-auto rounded-lg border border-border object-contain bg-muted transition-opacity duration-300 ${isLoading ? "opacity-0" : "opacity-100"}`}
                loading="lazy"
                onLoad={() => setIsLoading(false)}
            />
        </div>
    );
}

export function MessageAttachments({ files }: MessageAttachmentsProps) {
    if (!files || files.length === 0) return null;

    const images = files.filter((f) => f.mime_type.startsWith("image/"));
    const others = files.filter((f) => !f.mime_type.startsWith("image/"));

    return (
        <div className="flex flex-col gap-2 w-full my-2">
            {images.length > 0 && (
                <ScrollArea className="w-full whitespace-nowrap">
                    <div className="flex gap-2">
                        {images.map((file, fileIndex) => (
                            <ImageWithSpinner key={fileIndex} file={file} />
                        ))}
                    </div>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            )}
            {others.length > 0 && (
                <div className="flex flex-col gap-2">
                    {others.map((file, fileIndex) => (
                        <a
                            key={fileIndex}
                            href={file.public_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors group/file text-sm"
                        >
                            <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                <FileIcon className="size-4" />
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                <span className="font-medium truncate">{file.file_name}</span>
                                <span className="text-xs text-muted-foreground">
                                    {formatBytes(file.size)}
                                </span>
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
