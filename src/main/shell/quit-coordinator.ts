/**
 * Ordered app shutdown (W7):
 * 1) Abort every live agent run SYNCHRONOUSLY — each run's abort signal is
 *    what kills its ACP/pi child processes and provider sockets.
 * 2) Run child-process cleanup (opencode server stop, MCP servers) bounded by
 *    a timer, so a hung child cannot keep Electron from exiting and no orphan
 *    processes/timers survive the app.
 */

export type QuitOutcome = 'done' | 'timeout'

export async function coordinateQuit(opts: {
  /** Live runs; anything with abort(). Electron ActiveRun aborts its controller. */
  runs: Iterable<{ abort(): void }>
  /** Child-process stop functions (may reject or hang). */
  stops: Array<() => Promise<unknown>>
  timeoutMs: number
}): Promise<QuitOutcome> {
  for (const run of opts.runs) {
    try {
      run.abort()
    } catch {
      // A broken run record must not block shutdown.
    }
  }
  const cleanup = Promise.all(
    opts.stops.map((stop) => Promise.resolve().then(stop).catch(() => undefined))
  )
  return Promise.race([
    cleanup.then(
      () => 'done' as const,
      () => 'done' as const
    ),
    new Promise<QuitOutcome>((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), opts.timeoutMs)
      timer.unref?.()
    })
  ])
}
