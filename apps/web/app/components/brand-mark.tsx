import { cn } from "cn"
import { TentIcon } from "lucide-react"

/** The FlaiChat mark: the tent icon beside the wordmark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-normal tracking-tight", className)}>
      <TentIcon aria-hidden className="size-5 shrink-0" />
      <span className="truncate">FlaiChat</span>
    </span>
  )
}
