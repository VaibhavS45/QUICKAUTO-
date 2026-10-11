import { useCallback, useEffect, useState } from 'react'
import type { Plugin } from '../../../main/shell/plugin-registry.js'
import { Button } from '../../components/ui/button.js'
import { Card, CardTitle } from '../../components/ui/card.js'

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
    <div className="set-stack">
      <div className="settings-page-intro">
        <h2>Plugins</h2>
        <p>Review plugin manifests found in your user data folder. You can enable or disable them here; this build does not run plugin code.</p>
      </div>
      <Card>
        <CardTitle>Installed plugins <span className="settings-count">{plugins.length}</span></CardTitle>
        {loading ? <p className="set-empty-note">Checking your plugins folder…</p> : null}
        {!loading && plugins.length === 0 ? (
          <div className="set-empty-state">
            <span className="set-empty-icon" aria-hidden>＋</span>
            <h4>No plugins installed</h4>
            <p>Plugin manifests placed in the app’s user data plugins folder will appear here.</p>
          </div>
        ) : null}
        <div className="space-y-2 pt-3">
          {plugins.map((plugin) => (
            <div key={plugin.id} className="plugin-card flex items-center gap-3">
              <span className="plugin-mark" aria-hidden>{plugin.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-100">{plugin.name} <span className="text-xs text-neutral-500">v{plugin.version}</span></p>
                {plugin.description && <p className="plugin-description">{plugin.description}</p>}
                <p className="pt-0.5 font-mono text-[10px] text-neutral-600">{plugin.id}</p>
              </div>
              <span className={`plugin-state${plugin.enabled ? ' is-enabled' : ''}`}>{plugin.enabled ? 'Enabled' : 'Disabled'}</span>
              <Button variant={plugin.enabled ? 'secondary' : 'default'} size="sm" onClick={() => void toggle(plugin)}>
                {plugin.enabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          ))}
        </div>
        {error && <p className="pt-2 text-xs text-red-300" role="alert">{error}</p>}
      </Card>
    </div>
  )
}
