// Builds the preload script as CJS (required for sandboxed renderers)
// into out/preload/index.cjs. electron-vite emits ESM (.mjs) for
// "type": "module" projects, which the sandbox loader rejects.
import { buildSync } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

buildSync({
  entryPoints: [resolve(root, 'src/preload/index.ts')],
  outfile: resolve(root, 'out/preload/index.cjs'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  external: ['electron'],
  logLevel: 'info'
})
