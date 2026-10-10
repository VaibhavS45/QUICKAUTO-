import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/button.js'
import { Card, CardSub, CardTitle, Hint } from '../../components/ui/card.js'
import { Input, Select } from '../../components/ui/input.js'
import { buildEngines, type EngineInfo } from '../engines.js'
import AgentsPanel from './AgentsPanel.js'

interface ModelState {
  provider: string
  model: string
  baseUrl?: string
  resetDay?: number
  githubRepos?: Array<{ path: string; repo: string; testCommand?: string }>
  autoApprove?: string[]
  keySet: boolean
  encryptionAvailable: boolean
}

interface HarnessInfo {
  id: string
  installed: boolean
  version?: string
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="set-field">
      <span className="set-field-label">{label}</span>
      {children}
    </label>
  )
}

function EngineCard({ engine, active, onUse }: { engine: EngineInfo; active: boolean; onUse?: () => void }): React.JSX.Element {
  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800 text-lg text-neutral-100" aria-hidden>
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
          <span className="rounded-full bg-emerald-950 px-2.5 py-1 text-xs text-emerald-300">✓ Ready</span>
        ) : (
          <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-amber-300">● Needs setup</span>
        )}
        {active ? (
          <span className="text-xs font-medium text-sky-300">In use</span>
        ) : engine.version ? (
          <span className="font-mono text-xs text-neutral-400">v{engine.version}</span>
        ) : null}
      </div>
      {!engine.ready && engine.hint && <p className="pt-2 font-mono text-[11px] text-neutral-500">{engine.hint}</p>}
    </>
  )
  const cls = `rounded-2xl border bg-neutral-900 p-4 text-left transition-colors ${
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
 * Agents tab: engines (Ready / Needs setup, Image-1 style), the in-app model
 * + key for Built-in, auto-approve, and custom agent profiles. Replaces the
 * old standalone Provider tab — one place for everything that runs the agent.
 */
export default function AgentsTab(): React.JSX.Element {
  const [active, setActive] = useState('builtin')
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [model, setModel] = useState('')
  const [keySet, setKeySet] = useState(false)
  const [checking, setChecking] = useState(false)
  const [engineMsg, setEngineMsg] = useState<string | null>(null)

  const [provider, setProvider] = useState('anthropic')
  const [modelName, setModelName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [resetDay, setResetDay] = useState('1')
  const [autoApproveEcho, setAutoApproveEcho] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setChecking(true)
    try {
      const [p, d, m] = await Promise.all([
        window.app.getAgentProvider() as Promise<{ ok: boolean; provider?: string }>,
        window.app.detectHarnesses() as Promise<{ ok: boolean; harnesses?: HarnessInfo[] }>,
        window.app.getModelSettings() as Promise<ModelState>
      ])
      if (p.ok && p.provider) setActive(p.provider)
      if (d.ok && d.harnesses) setHarnesses(d.harnesses)
      setModel(m.model)
      setKeySet(m.keySet)
      setProvider(m.provider)
      setModelName(m.model)
      setBaseUrl(m.baseUrl ?? '')
      setResetDay(String(m.resetDay ?? 1))
      setAutoApproveEcho((m.autoApprove ?? []).includes('echo'))
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

  async function saveModel(): Promise<void> {
    setMsg(null)
    const rd = Math.min(28, Math.max(1, parseInt(resetDay, 10) || 1))
    const current = (await window.app.getModelSettings()) as ModelState
    const res = (await window.app.setModelSettings({
      provider,
      model: modelName.trim(),
      baseUrl: baseUrl.trim() || undefined,
      resetDay: rd,
      githubRepos: current.githubRepos,
      autoApprove: autoApproveEcho ? ['echo'] : []
    })) as { ok: boolean; error?: string }
    if (!res.ok) {
      setMsg(res.error ?? 'Save failed.')
      return
    }
    if (apiKey.trim()) {
      const kr = (await window.app.setApiKey(apiKey.trim())) as { ok: boolean; error?: string }
      if (!kr.ok) {
        setMsg(kr.error ?? 'Key save failed.')
        return
      }
      setApiKey('')
    }
    setMsg('Saved.')
    const m = (await window.app.getModelSettings()) as ModelState
    setModel(m.model)
    setKeySet(m.keySet)
  }

  const { ready, needsSetup } = buildEngines({ active, harnesses, model, keySet })

  return (
    <div className="set-stack">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-neutral-100">Engines and accounts</h3>
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={checking}>
            {checking ? 'Checking…' : '⟳ Check again'}
          </Button>
        </div>
        <p className="pt-1 text-sm text-neutral-500">Connect the AI tools that power your bots. Accounts, setup, and updates — all in one place.</p>
        {engineMsg && <p className="set-msg">{engineMsg}</p>}
      </div>
      <div>
        <div className="flex items-center justify-between pb-2">
          <span className="text-sm text-neutral-400">Ready</span>
          <span className="text-xs text-neutral-600">{ready.length} engine{ready.length === 1 ? '' : 's'}</span>
        </div>
        {ready.length === 0 && <p className="pb-2 text-sm text-neutral-600">Nothing ready yet — set up a model key or install a harness below.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {ready.map((e) => (
            <EngineCard key={e.id} engine={e} active={e.id === active} onUse={() => void useEngine(e.id)} />
          ))}
        </div>
      </div>
      {needsSetup.length > 0 && (
        <div>
          <div className="flex items-center justify-between pb-2">
            <span className="text-sm text-neutral-400">Needs setup</span>
            <span className="text-xs text-neutral-600">{needsSetup.length} engine{needsSetup.length === 1 ? '' : 's'}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {needsSetup.map((e) => (
              <EngineCard key={e.id} engine={e} active={false} />
            ))}
          </div>
        </div>
      )}
      <Card>
        <CardTitle>Model</CardTitle>
        <CardSub>Provider, model, and encrypted API key for the built-in engine.</CardSub>
        <div className="set-list">
          <div className="set-grid2">
            <Field label="Provider">
              <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="anthropic">anthropic</option>
                <option value="openai">openai</option>
                <option value="openai-compatible">openai-compatible</option>
              </Select>
            </Field>
            <Field label="Model">
              <Input monospace value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="claude-sonnet-4-5" />
            </Field>
          </div>
          {provider === 'openai-compatible' && (
            <Field label="Base URL">
              <Input monospace value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
            </Field>
          )}
          <div className="set-row">
            <div className="set-grow">
              <Field label={`API key ${keySet ? '(set ✓)' : '(not set)'}`}>
                <Input
                  monospace
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={keySet ? '•••••• (enter to replace)' : 'sk-…'}
                />
              </Field>
            </div>
            <Field label="Reset day">
              <input value={resetDay} onChange={(e) => setResetDay(e.target.value)} inputMode="numeric" className="set-reset" />
            </Field>
            <Button onClick={() => void saveModel()}>
              Save
            </Button>
          </div>
        </div>
        {msg && <p className="set-msg">{msg}</p>}
        <Hint>Keys are encrypted with the OS keychain (safeStorage) and never leave the main process.</Hint>
      </Card>
      <Card>
        <CardTitle>Auto-approve</CardTitle>
        <label className="set-check">
          <input
            type="checkbox"
            checked={autoApproveEcho}
            onChange={(e) => setAutoApproveEcho(e.target.checked)}
          />
          echo (harmless test tool) — runs without asking
        </label>
        <Hint>
          Default: everything asks. Writes (email draft/send/reply/labels) always need approval
          and can never auto-approve; scheduled runs never auto-approve anything.
        </Hint>
      </Card>
      <div>
        <h3 className="pb-2 text-sm text-neutral-400">Custom agents</h3>
        <AgentsPanel />
      </div>
    </div>
  )
}
