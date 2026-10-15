import { cn } from "cn"
import DOMPurify from "dompurify"
import { useMemo } from "react"

/** Provider logos are admin-supplied SVG markup or an image URL. SVG is sanitized before use. */
export function ProviderLogo({ logo, name, className }: { logo: string | null; name: string; className?: string }) {
  const svg = useMemo(
    () => (logo?.trim().startsWith("<svg") ? DOMPurify.sanitize(logo, { USE_PROFILES: { svg: true, svgFilters: true } }) : null),
    [logo]
  )
  if (!logo) return null
  if (svg) return <span aria-hidden className={cn("inline-flex size-4 shrink-0 [&>svg]:size-full", className)} dangerouslySetInnerHTML={{ __html: svg }} />
  return <img src={logo} alt={name} className={cn("size-4 shrink-0 object-contain", className)} />
}
