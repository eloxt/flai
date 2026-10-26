import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors duration-150 motion-reduce:transition-none enabled:hover:not-focus-visible:not-aria-invalid:border-foreground/40 outline-none placeholder:text-muted-foreground focus-visible:border-foreground disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive md:text-sm dark:disabled:bg-input/80",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
