import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Date functions read the viewer's time zone; tests pin one so they pass on any machine.
  test: { env: { TZ: 'UTC' } },
})
