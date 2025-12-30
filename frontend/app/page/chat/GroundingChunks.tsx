import { Separator } from "@/components/ui/separator";
import type { GoogleGroundingChunk, OpenaiGroundingData } from "./types";

interface GoogleGroundingChunksProps {
    chunks: GoogleGroundingChunk[];
    searchEntryPoint?: {
        renderedContent: string;
    };
}

export function GoogleGroundingChunks({ chunks, searchEntryPoint }: GoogleGroundingChunksProps) {
    if (!chunks || chunks.length === 0) return null;

    return (
        <div className="mt-2 mx-4 flex flex-col gap-4">
            <Separator />
            <div className="flex flex-wrap gap-2">
                {chunks.map(
                    (chunk, i) =>
                        chunk.web && (
                            <a
                                key={i}
                                href={chunk.web.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs bg-secondary/50 hover:bg-secondary px-2 py-1 rounded-md transition-colors flex items-center gap-1 max-w-full truncate"
                                title={chunk.web.title}
                            >
                                <span className="opacity-70">[{i + 1}]</span>
                                <span className="truncate max-w-[150px]">{chunk.web.title}</span>
                            </a>
                        )
                )}
            </div>
            {searchEntryPoint && (
                <div dangerouslySetInnerHTML={{ __html: searchEntryPoint.renderedContent }} />
            )}
        </div>
    );
}

interface OpenaiGroundingChunksProps {
    groundingData: OpenaiGroundingData[];
}

export function OpenaiGroundingChunks({ groundingData }: OpenaiGroundingChunksProps) {
    if (!groundingData || groundingData.length === 0) return null;

    return (
        <div className="mt-2 mx-4 flex flex-col gap-4">
            <Separator />
            <div className="flex flex-wrap gap-2">
                {groundingData.map((data, i) => (
                    <a
                        key={i}
                        href={data.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-secondary/50 hover:bg-secondary px-2 py-1 rounded-md transition-colors flex items-center gap-1 max-w-full truncate"
                        title={data.title}
                    >
                        <span className="opacity-70">[{i + 1}]</span>
                        <span className="truncate max-w-[150px]">{data.title}</span>
                    </a>
                ))}
            </div>
        </div>
    );
}
