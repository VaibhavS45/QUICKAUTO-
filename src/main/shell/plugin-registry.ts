import { z } from 'zod'

const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/),
  name: z.string().trim().min(1).max(100),
  version: z.string().trim().min(1).max(40),
  description: z.string().max(1000).optional()
})

export type PluginManifest = z.infer<typeof PluginManifestSchema>
export interface Plugin extends PluginManifest {
  enabled: boolean
}

export interface PluginStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

const ENABLED_KEY = 'enabled-plugins'

export class PluginRegistry {
  private plugins = new Map<string, Plugin>()

  constructor(private readonly store: PluginStore) {}

  load(manifests: unknown[]): { loaded: number; rejected: number } {
    const enabledRaw = this.store.get(ENABLED_KEY)
    const enabled = new Set(Array.isArray(enabledRaw) ? enabledRaw.filter((id): id is string => typeof id === 'string') : [])
    const next = new Map<string, Plugin>()
    let rejected = 0
    for (const raw of manifests) {
      const parsed = PluginManifestSchema.safeParse(raw)
      if (!parsed.success || next.has(parsed.data.id)) {
        rejected++
        continue
      }
      next.set(parsed.data.id, { ...parsed.data, enabled: enabled.has(parsed.data.id) })
    }
    this.plugins = next
    return { loaded: next.size, rejected }
  }

  list(): Plugin[] {
    return [...this.plugins.values()].map((plugin) => ({ ...plugin }))
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const plugin = this.plugins.get(id)
    if (!plugin) return false
    plugin.enabled = enabled
    this.store.set(ENABLED_KEY, [...this.plugins.values()].filter((item) => item.enabled).map((item) => item.id))
    return true
  }
}
