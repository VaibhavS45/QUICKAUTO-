import { Composio } from '@composio/core'
import { VercelProvider } from '@composio/vercel'
import { z } from 'zod'
import { COMPOSIO_USER_ID } from './composio.js'

const ToolkitResponseSchema = z.object({
  items: z.array(z.object({
    slug: z.string(),
    name: z.string(),
    meta: z.object({
      description: z.string().optional(),
      logo: z.string().optional(),
      app_url: z.string().nullable().optional(),
      tools_count: z.number().optional(),
      categories: z.array(z.object({ name: z.string().optional() }).passthrough()).optional()
    }).passthrough()
  }).passthrough())
}).passthrough()

export interface ComposioToolkit {
  slug: string
  name: string
  description: string
  logo?: string
  appUrl?: string
  toolsCount?: number
  categories: string[]
  connected: boolean
}

interface ComposioSessionLike {
  authorize(toolkit: string): Promise<{ redirectUrl?: string }>
  toolkits(options?: { toolkits?: string[]; limit?: number; isConnected?: boolean }): Promise<{
    items: Array<{
      slug: string
      name: string
      logo?: string
      connection?: { isActive: boolean }
    }>
  }>
}

interface ComposioClientLike {
  sessions: {
    create(
      userId: string,
      config?: { toolkits?: string[]; manageConnections?: boolean }
    ): Promise<ComposioSessionLike>
  }
}

export interface ComposioMarketplaceDependencies {
  getApiKey: () => Promise<string | null>
  fallbackApiKey?: string
  getUserId?: () => string
  fetch?: typeof fetch
  createClient?: (apiKey: string) => ComposioClientLike
}

export function describeComposioError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/invalid api.?key|revoked|unauthori[sz]ed|\b401\b/i.test(message)) {
    return 'Composio rejected this key. It may be revoked or expired. Enter a new project key from the Composio dashboard.'
  }
  if (/permission|scope|session management|not allowed|\b403\b|forbidden/i.test(message)) {
    return 'This Composio key is missing permissions. In the Composio dashboard, enable Session management and Session tool execution for the project key, or create a full-access project key, then enter it again.'
  }
  return message
}

function createClient(apiKey: string): ComposioClientLike {
  return new Composio({ apiKey, provider: new VercelProvider() }) as unknown as ComposioClientLike
}

function secureUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export class ComposioMarketplace {
  private readonly fetchImpl: typeof fetch

  constructor(private readonly deps: ComposioMarketplaceDependencies) {
    this.fetchImpl = deps.fetch ?? fetch
  }

  private userId(): string {
    return this.deps.getUserId?.() ?? COMPOSIO_USER_ID
  }

  private async apiKey(): Promise<string> {
    const key = (await this.deps.getApiKey()) || this.deps.fallbackApiKey || null
    if (!key) throw new Error('Add your Composio project key to browse and connect apps.')
    return key
  }

  private async client(): Promise<ComposioClientLike> {
    const key = await this.apiKey()
    return (this.deps.createClient ?? createClient)(key)
  }

  async validateApiKey(apiKey: string): Promise<void> {
    const key = apiKey.trim()
    if (!key.startsWith('ak_') || key.length < 10 || key.length > 10000) {
      throw new Error('Composio project key must start with "ak_" and be at least 10 characters long.')
    }
    try {
      await (this.deps.createClient ?? createClient)(key)
        .sessions.create(this.userId(), { manageConnections: false })
    } catch (error) {
      throw new Error(describeComposioError(error))
    }
  }

  async list(search: string): Promise<ComposioToolkit[]> {
    const key = await this.apiKey()
    const url = new URL('https://backend.composio.dev/api/v3.1/toolkits')
    url.searchParams.set('limit', '50')
    url.searchParams.set('sort_by', 'alphabetically')
    if (search.trim()) url.searchParams.set('search', search.trim().slice(0, 100))

    const response = await this.fetchImpl(url, { headers: { 'x-api-key': key } })
    if (!response.ok) throw new Error(describeComposioError(
      new Error(`Composio app catalog request failed (${response.status}). Check your project key and try again.`)
    ))
    const parsed = ToolkitResponseSchema.safeParse(await response.json())
    if (!parsed.success) throw new Error('Composio returned an invalid app catalog response.')

    const items = parsed.data.items
    let connectionState: Awaited<ReturnType<ComposioSessionLike['toolkits']>>
    try {
      const session = await (this.deps.createClient ?? createClient)(key)
        .sessions.create(this.userId(), { toolkits: items.map((item) => item.slug), manageConnections: false })
      connectionState = await session.toolkits({
        toolkits: items.map((item) => item.slug),
        limit: 50
      })
    } catch (error) {
      throw new Error(describeComposioError(error))
    }
    const connected = new Set(connectionState.items.filter((item) => item.connection?.isActive).map((item) => item.slug))

    return items.map((item) => ({
      slug: item.slug,
      name: item.name,
      description: item.meta.description ?? '',
      logo: secureUrl(item.meta.logo),
      appUrl: secureUrl(item.meta.app_url ?? undefined),
      toolsCount: item.meta.tools_count,
      categories: (item.meta.categories ?? []).flatMap((category) =>
        typeof category.name === 'string' ? [category.name] : []
      ),
      connected: connected.has(item.slug)
    }))
  }

  async connect(toolkit: string): Promise<string> {
    let request: { redirectUrl?: string }
    try {
      const session = await (await this.client()).sessions.create(this.userId(), {
        toolkits: [toolkit],
        manageConnections: false
      })
      request = await session.authorize(toolkit)
    } catch (error) {
      throw new Error(describeComposioError(error))
    }
    const redirectUrl = secureUrl(request.redirectUrl)
    if (!redirectUrl) throw new Error('Composio did not return a secure connection link.')
    return redirectUrl
  }
}
