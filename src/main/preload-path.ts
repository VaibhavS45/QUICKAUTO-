import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Preload must be CJS for the sandboxed renderer loader. */
export function preloadPath(): string {
  const candidates = [
    join(__dirname, '../preload/index.cjs'),
    join(app.getAppPath(), 'preload/index.cjs'),
    join(__dirname, '../preload/index.mjs'),
    join(__dirname, '../preload/index.js')
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!
}
