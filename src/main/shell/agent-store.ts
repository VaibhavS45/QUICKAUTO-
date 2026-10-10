import { z } from 'zod'

export const MAX_AGENTS = 20
export const BUILTIN_AGENT_ID = 'chat'

export const AgentProfileSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
  name: z.string().trim().min(1).max(80),
  systemPrompt: z.string().max(4000),
  builtin: z.boolean().optional()
}).strict()

export type AgentProfile = z.infer<typeof AgentProfileSchema>

export const DEFAULT_CHAT_AGENT: AgentProfile = {
  id: BUILTIN_AGENT_ID,
  name: 'Chat',
  systemPrompt: '',
  builtin: true
}

export interface AgentStoreStorage {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

const STORE_KEY = 'agents'

export class AgentStore {
  private agents: AgentProfile[]

  constructor(private readonly storage: AgentStoreStorage) {
    this.agents = this.read()
  }

  list(): AgentProfile[] {
    return this.agents.map((agent) => ({ ...agent }))
  }

  create(input: unknown): AgentProfile {
    const parsed = AgentProfileSchema.omit({ builtin: true }).safeParse(input)
    if (!parsed.success) throw new Error('Invalid agent profile.')
    if (this.agents.some((agent) => agent.id === parsed.data.id)) throw new Error('An agent with that id already exists.')
    if (this.agents.length >= MAX_AGENTS) throw new Error(`You can save up to ${MAX_AGENTS} agents.`)
    const agent = parsed.data
    this.save([...this.agents, agent])
    return { ...agent }
  }

  update(id: string, input: unknown): AgentProfile {
    if (id === BUILTIN_AGENT_ID) throw new Error('The built-in Chat agent cannot be edited.')
    const parsed = AgentProfileSchema.omit({ builtin: true }).safeParse(input)
    if (!parsed.success || parsed.data.id !== id) throw new Error('Invalid agent profile.')
    const index = this.agents.findIndex((agent) => agent.id === id)
    if (index < 0) throw new Error('Agent not found.')
    const next = this.agents.map((agent, i) => i === index ? parsed.data : agent)
    this.save(next)
    return { ...parsed.data }
  }

  remove(id: string): boolean {
    if (id === BUILTIN_AGENT_ID) throw new Error('The built-in Chat agent cannot be deleted.')
    const next = this.agents.filter((agent) => agent.id !== id)
    if (next.length === this.agents.length) return false
    this.save(next)
    return true
  }

  private read(): AgentProfile[] {
    const raw = this.storage.get(STORE_KEY)
    const candidates = Array.isArray(raw) ? raw : []
    const result: AgentProfile[] = [DEFAULT_CHAT_AGENT]
    for (const candidate of candidates) {
      const parsed = AgentProfileSchema.safeParse(candidate)
      if (!parsed.success || parsed.data.id === BUILTIN_AGENT_ID || result.some((agent) => agent.id === parsed.data.id)) continue
      result.push({ ...parsed.data, builtin: false })
      if (result.length === MAX_AGENTS) break
    }
    return result
  }

  private save(agents: AgentProfile[]): void {
    const capped = agents.slice(0, MAX_AGENTS)
    const parsed = z.array(AgentProfileSchema).max(MAX_AGENTS).safeParse(capped)
    if (!parsed.success) throw new Error('Invalid agent data.')
    this.storage.set(STORE_KEY, parsed.data)
    this.agents = parsed.data
  }
}
