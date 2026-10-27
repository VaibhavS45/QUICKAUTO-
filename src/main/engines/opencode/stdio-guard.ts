import type { EventEmitter } from 'node:events'

/**
 * Keep a closed stdout/stderr from crashing the app.
 *
 * Launched without a console (Finder, `open`, closed pipes), even Electron's
 * own warnings hit EPIPE on write and surface as an uncaught exception that
 * kills the main process. Swallow only EPIPE; any other stream error still
 * throws. Returns an uninstall function (used by tests).
 */
export function installStdioGuard(streams: EventEmitter[] = [process.stdout, process.stderr]): () => void {
  const offs: Array<() => void> = []
  for (const s of streams) {
    const onError = (err: unknown): void => {
      if ((err as { code?: string } | null)?.code !== 'EPIPE') throw err
    }
    s.on('error', onError)
    offs.push(() => s.removeListener('error', onError))
  }
  return () => offs.forEach((off) => off())
}
