/**
 * Pure single-instance / cold-start argv decisions (no node/electron imports).
 * Tested by tests/unit/startup.test.ts.
 */

/** True when argv asks the running instance to toggle the palette. */
export function wantsToggle(argv: string[]): boolean {
  return argv.includes('--toggle') || argv.includes('palette --toggle')
}

/**
 * Cold-start policy: a `--toggle` launch must never do nothing.
 * - First instance + `--toggle`  -> 'show' (a hotkey press shows the palette)
 * - First instance + no args     -> 'hidden' (autostart stays in the tray)
 * Second instances never get here: they signal the first via the
 * single-instance lock and exit.
 */
export function coldStartVisibility(argv: string[]): 'show' | 'hidden' {
  return wantsToggle(argv) ? 'show' : 'hidden'
}
