import { useCallback, useEffect, useState } from 'react'
import type { AgentProfile } from '../../../main/shell/agent-store.js'
import { Button } from '../../components/ui/button.js'
import { Card, CardSub, CardTitle } from '../../components/ui/card.js'
import { Input, Textarea } from '../../components/ui/input.js'

type EditableAgent = Omit<AgentProfile, 'builtin'>

const blank: EditableAgent = { id: '', name: '', systemPrompt: '' }

export default function AgentsPanel(): React.JSX.Element {
  const [agents, setAgents] = useState<AgentProfile[]>([])
  const [form, setForm] = useState<EditableAgent>(blank)
  const [editing, setEditing] = useState(false)
  const [pendingDelete, setPendingDelete] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    const result = await window.app.agentsList()
    if (!result.ok || !result.agents) throw new Error(result.error || 'Could not load agents.')
    setAgents(result.agents)
  }, [])

  useEffect(() => {
    void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [refresh])

  function beginEdit(agent: AgentProfile): void {
    if (agent.builtin) return
    setForm({ id: agent.id, name: agent.name, systemPrompt: agent.systemPrompt })
    setEditing(true)
    setError('')
  }

  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError('')
    try {
      const result = editing
        ? await window.app.agentUpdate(form.id, form)
        : await window.app.agentCreate(form)
      if (!result.ok) throw new Error(result.error || 'Could not save agent.')
      setForm(blank)
      setEditing(false)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  async function remove(id: string): Promise<void> {
    setError('')
    try {
      const result = await window.app.agentRemove(id)
      if (!result.ok) throw new Error(result.error || 'Could not delete agent.')
      setPendingDelete('')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Agents ({agents.length}/20)</CardTitle>
        <CardSub>Chat is built in and cannot be edited or deleted. Custom agents are saved locally; their system prompt is not active in Chat yet.</CardSub>
        <div className="space-y-2 pt-3">
          {agents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-neutral-100">{agent.name} {agent.builtin && <span className="text-xs text-neutral-500">Built in</span>}</p>
                <p className="truncate pt-0.5 font-mono text-[10px] text-neutral-600">{agent.id}</p>
              </div>
              {!agent.builtin && <>
                <Button variant="secondary" size="sm" onClick={() => beginEdit(agent)}>Edit</Button>
                <Button variant="secondary" size="sm" onClick={() => setPendingDelete(agent.id)}>Delete</Button>
              </>}
            </div>
          ))}
        </div>
        {pendingDelete && (
          <div className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/30 p-3" role="alertdialog" aria-label="Confirm agent deletion">
            <p className="text-xs text-amber-100">Delete this agent? This cannot be undone.</p>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setPendingDelete('')}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={() => void remove(pendingDelete)}>Delete agent</Button>
            </div>
          </div>
        )}
      </Card>
      <Card>
        <CardTitle>{editing ? 'Edit agent' : 'Create agent'}</CardTitle>
        <form className="space-y-3 pt-3" onSubmit={(event) => void save(event)}>
          <Input
            value={form.id}
            onChange={(event) => setForm((current) => ({ ...current, id: event.target.value }))}
            placeholder="agent-id"
            aria-label="Agent ID"
            disabled={editing}
          />
          <Input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Agent name"
            aria-label="Agent name"
          />
          <Textarea
            value={form.systemPrompt}
            onChange={(event) => setForm((current) => ({ ...current, systemPrompt: event.target.value }))}
            placeholder="System prompt"
            aria-label="Agent system prompt"
            rows={4}
          />
          <div className="flex gap-2">
            <Button type="submit">{editing ? 'Save changes' : 'Create agent'}</Button>
            {editing && <Button type="button" variant="secondary" onClick={() => { setEditing(false); setForm(blank) }}>Cancel</Button>}
          </div>
        </form>
        {error && <p className="pt-2 text-xs text-red-300" role="alert">{error}</p>}
      </Card>
    </div>
  )
}
