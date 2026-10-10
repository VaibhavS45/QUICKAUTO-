export function wantsBackground(argv: string[]): boolean {
  return argv.includes('--background')
}

export function shouldAutoOpenApp(argv: string[]): boolean {
  return !wantsBackground(argv)
}
