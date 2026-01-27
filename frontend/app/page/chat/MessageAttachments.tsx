import { FileIcon } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { Attachment } from "../../types/chat";
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { formatBytes } from "@/lib/utils";

interface MessageAttachmentsProps {
    files: Attachment[];
}

export function MessageAttachments({ files }: MessageAttachmentsProps) {
    if (!files || files.length === 0) return null;

    const images = files.filter((f) => f.mime_type.startsWith("image/"));
    const others = files.filter((f) => !f.mime_type.startsWith("image/"));

    return (
        <div className="flex flex-col items-end gap-2 w-full my-2">
            {images.length > 0 && (
                <ScrollArea className="whitespace-nowrap">
                    <div className="flex gap-2 max-w-80 md:max-w-4/6">
                        <PhotoProvider>
                            {images.map((file, fileIndex) => (
                                <PhotoView src={file.public_url} key={fileIndex}>
                                    <img
                                        src={file.public_url}
                                        alt={file.file_name}
                                        className="max-h-40 max-w-80 rounded-lg border border-border"
                                        loading="lazy"
                                    />
                                </PhotoView>
                            ))}
                        </PhotoProvider>
                    </div>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            )}
            {others.length > 0 && (
                <div className="flex flex-col gap-2 max-w-72">
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
