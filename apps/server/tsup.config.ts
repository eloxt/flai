import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', migrate: 'src/db/migrate.ts', 'migrate-from-flai': 'scripts/migrate-from-flai.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // Bundle the workspace package; keep real npm dependencies external.
  noExternal: ['@flai/shared'],
})
