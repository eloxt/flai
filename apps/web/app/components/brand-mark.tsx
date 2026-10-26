import { cn } from "cn"
import { FlaiMark } from "~/components/flai-mark"

/** The FlaiChat mark beside the wordmark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-normal tracking-tight", className)}>
      <FlaiMark className="size-5" />
      <span className="truncate font-semibold text-title">FlaiChat</span>
    </span>
  )
}
