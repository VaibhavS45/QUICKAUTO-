export interface HarnessInfo {
  id: string
  installed: boolean
  version?: string
}

export interface EngineInfo {
  id: 'builtin' | 'opencode' | 'pi'
  name: string
  subtitle: string
  glyph: string
  /** Visible + selectable. */
  ready: boolean
  version?: string
  /** Why it is in "needs setup" (install hint / missing key). */
  hint?: string
}

/**
 * Split engines into Ready / Needs-setup groups (pure, unit-tested).
 * builtin is ready when a model API key is set; harnesses when on PATH.
 */
export function buildEngines(input: {
  active: string
  harnesses: HarnessInfo[]
  model: string
  keySet: boolean
}): { ready: EngineInfo[]; needsSetup: EngineInfo[]; active: string } {
  const byId = (id: string): HarnessInfo | undefined => input.harnesses.find((h) => h.id === id)
  const engines: EngineInfo[] = [
    {
      id: 'builtin',
      name: 'Built-in',
      subtitle: input.model || 'No model yet',
      glyph: '◈',
      ready: input.keySet,
      ...(input.keySet ? {} : { hint: 'Add a model API key below.' })
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      subtitle: 'OpenCode',
      glyph: '▣',
      ready: byId('opencode')?.installed ?? false,
      ...(byId('opencode')?.version ? { version: byId('opencode')?.version } : {}),
      ...(!byId('opencode')?.installed ? { hint: 'Install: https://opencode.ai' } : {})
    },
    {
      id: 'pi',
      name: 'pi',
      subtitle: 'Bring your own model',
      glyph: 'π',
      ready: byId('pi')?.installed ?? false,
      ...(byId('pi')?.version ? { version: byId('pi')?.version } : {}),
      ...(!byId('pi')?.installed ? { hint: 'Install: curl -fsSL https://pi.dev/install.sh | sh' } : {})
    }
  ]
  return {
    ready: engines.filter((e) => e.ready),
    needsSetup: engines.filter((e) => !e.ready),
    active: input.active
  }
}
