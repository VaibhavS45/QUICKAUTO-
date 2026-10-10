import { useEffect, useState } from 'react'
import { Card, CardSub, CardTitle } from '../../components/ui/card.js'

interface ModelState {
  provider: string
  baseUrl?: string
  keySet: boolean
}

interface ConnectorState {
  configured: boolean
}

export default function ApiPanel(): React.JSX.Element {
  const [model, setModel] = useState<ModelState | null>(null)
  const [connector, setConnector] = useState<ConnectorState | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([window.app.getModelSettings(), window.app.getConnector()])
      .then(([modelSettings, connectorSettings]) => {
        if (!active) return
        setModel(modelSettings)
        setConnector(connectorSettings)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => { active = false }
  }, [])

  return (
    <Card>
      <CardTitle>API and keys</CardTitle>
      <CardSub>Only key presence and configured base URLs are shown here; secret values are never returned to this screen.</CardSub>
      {model ? (
        <dl className="space-y-2 pt-3 text-xs">
          <div className="flex justify-between gap-3"><dt className="text-neutral-400">{model.provider} API key</dt><dd className="text-neutral-200">{model.keySet ? 'Set' : 'Not set'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-neutral-400">Model base URL</dt><dd className="max-w-[65%] break-all text-right font-mono text-neutral-300">{model.baseUrl || 'Provider default'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-neutral-400">Composio project key</dt><dd className="text-neutral-200">{connector?.configured ? 'Set' : 'Not set'}</dd></div>
        </dl>
      ) : <p className="pt-3 text-xs text-neutral-500">Loading key status…</p>}
      <p className="pt-3 text-xs text-neutral-400">No local API server.</p>
      {error && <p className="pt-2 text-xs text-red-300" role="alert">{error}</p>}
    </Card>
  )
}
