import { Construction } from "lucide-react";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";

export default function Search() {
    return (
        <div className="flex h-full w-full items-center justify-center p-4">
            <Empty>
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <Construction className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>Search Under Construction</EmptyTitle>
                    <EmptyDescription>
                        We are working hard to bring you the best search experience. Please
                        check back later.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        </div>
    );
}