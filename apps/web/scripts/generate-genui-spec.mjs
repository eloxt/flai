import { writeFileSync } from "node:fs"
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib"

// Keep the backend independent of React while sharing the official component signatures.
writeFileSync(
  new URL("../../../packages/shared/src/genui/openui.spec.json", import.meta.url),
  JSON.stringify({ library: openuiLibrary.toSpec(), promptOptions: openuiPromptOptions }, null, 2) + "\n",
)
