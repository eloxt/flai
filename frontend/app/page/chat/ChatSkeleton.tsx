import { Skeleton } from "@/components/ui/skeleton";

export function ChatSkeleton() {
    return (
        <div className="flex flex-col gap-6 w-full">
            <div className="flex flex-col items-end gap-2 max-w-[80%] self-end">
                <div className="px-4 py-3 rounded-2xl w-full bg-[var(--secondary)]">
                    <Skeleton className="h-4 w-[200px]" />
                </div>
            </div>

            <div className="flex flex-col items-start gap-2 max-w-full">
                <div className="px-4 rounded-2xl w-full">
                    <div className="flex items-center gap-2 py-2">
                        <Skeleton className="h-3 w-3 rounded-sm" />
                        <Skeleton className="h-3 w-24" />
                    </div>

                    <div className="space-y-2.5 mt-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-[92%]" />
                        <Skeleton className="h-4 w-[96%]" />
                        <Skeleton className="h-4 w-[85%]" />
                    </div>
                </div>
            </div>
        </div>
    );
}
