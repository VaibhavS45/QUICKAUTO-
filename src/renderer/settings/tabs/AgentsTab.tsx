import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/button.js'
import { buildEngines, type EngineInfo } from '../engines.js'
import AgentsPanel from './AgentsPanel.js'

interface HarnessInfo {
  id: string
  installed: boolean
  version?: string
}

/** Install command lifted from the engine hint line ("Install: <cmd>"). */
function installCommand(hint?: string): string | null {
  if (!hint || !hint.startsWith('Install: ')) return null
  return hint.slice('Install: '.length).trim()
}

/** Mono code block + copy button; the write is a local clipboard action only. */
function InstallBlock({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <div className="set-code">
      <code>{text}</code>
      <button
        type="button"
        className="set-copy"
        aria-label="Copy install command"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
          })
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function EngineCard({ engine, active, onUse }: { engine: EngineInfo; active: boolean; onUse?: () => void }): React.JSX.Element {
  const install = installCommand(engine.hint)
  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800 text-lg text-neutral-100" aria-hidden>
          {engine.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-100">{engine.name}</p>
          <p className="truncate text-xs text-neutral-500">{engine.subtitle}</p>
        </div>
        <span className="text-neutral-600" aria-hidden>⌄</span>
      </div>
      <div className="flex items-center justify-between pt-3">
        {engine.ready ? (
          <span className="set-status is-ready">Ready</span>
        ) : (
          <span className="set-status is-setup">Needs setup</span>
        )}
        {active ? (
          <span className="set-active-inline">In use</span>
        ) : engine.version ? (
          <span className="font-mono text-xs text-neutral-400">v{engine.version}</span>
        ) : null}
      </div>
      {!engine.ready && engine.hint && (install ? <InstallBlock text={install} /> : <p className="pt-2 font-mono text-[11px] text-neutral-500">{engine.hint}</p>)}
    </>
  )
  const cls = `rounded-lg border bg-neutral-900 p-4 text-left transition-colors ${
    active ? 'border-sky-500/60' : 'border-neutral-800 hover:border-neutral-600'
  }`
  return engine.ready && !active && onUse ? (
    <button onClick={onUse} className={cls} aria-label={`Use ${engine.name}`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

/**
 * Agents tab: the OpenCode (ACP) engine, and the custom agents you can run.
 * OpenCode brings its own models and auth (`opencode auth login`), so there is
 * no in-app provider/model/API-key setup here.
 */
export default function AgentsTab(): React.JSX.Element {
  const [active, setActive] = useState('opencode')
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [checking, setChecking] = useState(false)
  const [engineMsg, setEngineMsg] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setChecking(true)
    try {
      const [p, d] = await Promise.all([
        window.app.getAgentProvider() as Promise<{ ok: boolean; provider?: string }>,
        window.app.detectHarnesses() as Promise<{ ok: boolean; harnesses?: HarnessInfo[] }>
      ])
      if (p.ok && p.provider) setActive(p.provider)
      if (d.ok && d.harnesses) setHarnesses(d.harnesses)
    } catch {
      setEngineMsg('Could not check engines.')
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function useEngine(id: string): Promise<void> {
    setEngineMsg(null)
    const res = (await window.app.setAgentProvider(id)) as { ok: boolean; error?: string }
    if (res.ok) setActive(id)
    else setEngineMsg(res.error ?? 'Save failed.')
  }

  const { ready, needsSetup } = buildEngines({ active, harnesses })

  return (
    <div className="set-stack">
      <div className="settings-page-intro">
        <div className="flex items-center justify-between">
          <div>
            <h2>Agents</h2>
            <p>OpenCode runs your agents. Manage the custom agents you can run.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={checking}>
            {checking ? 'Checking…' : '⟳ Check again'}
          </Button>
        </div>
        {engineMsg && <p className="set-msg">{engineMsg}</p>}
      </div>
      <div>
        <div className="flex items-center justify-between pb-2">
          <span className="set-subhead-inline">Ready to use</span>
          <span className="text-xs text-neutral-600">{ready.length} engine{ready.length === 1 ? '' : 's'}</span>
        </div>
        {ready.length === 0 && <p className="set-empty-note">OpenCode is not installed yet. Install it below to get started.</p>}
        <div className="grid gap-3 md:grid-cols-2 settings-engine-grid">
          {ready.map((e) => (
            <EngineCard key={e.id} engine={e} active={e.id === active} onUse={() => void useEngine(e.id)} />
          ))}
        </div>
      </div>
      {needsSetup.length > 0 && (
        <div>
          <div className="flex items-center justify-between pb-2">
            <span className="set-subhead-inline">Needs setup</span>
            <span className="text-xs text-neutral-600">{needsSetup.length} engine{needsSetup.length === 1 ? '' : 's'}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 settings-engine-grid">
            {needsSetup.map((e) => (
              <EngineCard key={e.id} engine={e} active={false} />
            ))}
          </div>
        </div>
      )}
      <div>
        <h3 className="set-subhead">Custom agents</h3>
        <AgentsPanel />
      </div>
    </div>
  )
}
