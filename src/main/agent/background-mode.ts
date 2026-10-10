/** `--toggle` remains a second-instance palette command until the palette is removed. */
export function wantsToggle(argv: string[]): boolean {
  return argv.includes('--toggle') || argv.includes('palette --toggle')
}

/** Open the app on launch unless explicitly started tray-only. */
export function shouldAutoOpenApp(argv: string[]): boolean {
  return !argv.includes('--background')
}
