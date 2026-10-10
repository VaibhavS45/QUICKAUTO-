import { useCallback, useEffect, useState } from 'react'
import type { Plugin } from '../../../main/shell/plugin-registry.js'
import { Button } from '../../components/ui/button.js'
import { Card, CardSub, CardTitle } from '../../components/ui/card.js'

export default function PluginsPanel(): React.JSX.Element {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (): Promise<void> => {
    const result = await window.app.pluginsList()
    if (!result.ok || !result.plugins) throw new Error(result.error || 'Could not load plugins.')
    setPlugins(result.plugins)
  }, [])

  useEffect(() => {
    void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false))
  }, [refresh])

  async function toggle(plugin: Plugin): Promise<void> {
    setError('')
    try {
      const result = await window.app.pluginEnable(plugin.id, !plugin.enabled)
      if (!result.ok || !result.plugins) throw new Error(result.error || 'Could not update plugin.')
      setPlugins(result.plugins)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <Card>
      <CardTitle>Plugins ({plugins.length})</CardTitle>
      <CardSub>Installed manifests are read from your user data plugins folder. This build lists and enables plugins but does not execute plugin code.</CardSub>
      {loading ? <p className="pt-3 text-xs text-neutral-500">Loading plugins…</p> : null}
      {!loading && plugins.length === 0 ? <p className="pt-3 text-xs text-neutral-500">No plugin manifests found in the plugins folder.</p> : null}
      <div className="space-y-2 pt-3">
        {plugins.map((plugin) => (
          <div key={plugin.id} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-neutral-100">{plugin.name} <span className="text-xs text-neutral-500">v{plugin.version}</span></p>
              {plugin.description && <p className="truncate pt-0.5 text-xs text-neutral-500">{plugin.description}</p>}
              <p className="pt-0.5 font-mono text-[10px] text-neutral-600">{plugin.id}</p>
            </div>
            <Button variant={plugin.enabled ? 'secondary' : 'default'} size="sm" onClick={() => void toggle(plugin)}>
              {plugin.enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>
        ))}
      </div>
      {error && <p className="pt-2 text-xs text-red-300" role="alert">{error}</p>}
    </Card>
  )
}
