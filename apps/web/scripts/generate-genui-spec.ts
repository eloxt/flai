import { writeFileSync } from "node:fs"
import { buildGenuiSpec } from "../app/components/genui/prompt-spec"

// Keep the backend independent of React while sharing the official component signatures.
writeFileSync(
  new URL(
    "../../../packages/shared/src/genui/openui.spec.json",
    import.meta.url
  ),
  JSON.stringify(buildGenuiSpec(), null, 2) + "\n"
)
