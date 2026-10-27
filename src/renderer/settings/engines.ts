export interface HarnessInfo {
  id: string
  installed: boolean
  version?: string
}

export interface EngineInfo {
  id: 'opencode'
  name: string
  subtitle: string
  glyph: string
  /** Visible + selectable. */
  ready: boolean
  version?: string
  /** Why it is in "needs setup" (install hint). */
  hint?: string
}

/**
 * Split engines into Ready / Needs-setup groups (pure, unit-tested).
 * OpenCode (ACP) is the only engine; it is ready when the CLI is on PATH.
 */
export function buildEngines(input: {
  active: string
  harnesses: HarnessInfo[]
}): { ready: EngineInfo[]; needsSetup: EngineInfo[]; active: string } {
  const opencode = input.harnesses.find((h) => h.id === 'opencode')
  const engines: EngineInfo[] = [
    {
      id: 'opencode',
      name: 'OpenCode',
      subtitle: 'ACP engine',
      glyph: '▣',
      ready: opencode?.installed ?? false,
      ...(opencode?.version ? { version: opencode.version } : {}),
      ...(opencode?.installed ? {} : { hint: 'Install: https://opencode.ai' })
    }
  ]
  return {
    ready: engines.filter((e) => e.ready),
    needsSetup: engines.filter((e) => !e.ready),
    active: input.active
  }
}
