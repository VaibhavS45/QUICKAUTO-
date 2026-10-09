/**
 * Calendar-first launch policy (pure, unit-tested).
 *
 * The calendar opens on launch and the command bar + schedules stay
 * available from there. `--toggle` starts tray-only (no calendar) for
 * Wayland fallback / background-login use.
 */
export function wantsToggle(argv: string[]): boolean {
  return argv.includes('--toggle') || argv.includes('palette --toggle')
}

/** Open the calendar on launch unless started tray-only via `--toggle`. */
export function shouldAutoOpenCalendar(argv: string[]): boolean {
  if (argv.includes('--calendar')) return true
  return !wantsToggle(argv)
}
