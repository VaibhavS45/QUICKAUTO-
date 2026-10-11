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
  fetch?: typeof fetch
  createClient?: (apiKey: string) => ComposioClientLike
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

  private async apiKey(): Promise<string> {
    const key = await this.deps.getApiKey()
    if (!key) throw new Error('Add your Composio project key to browse and connect apps.')
    return key
  }

  private async client(): Promise<ComposioClientLike> {
    const key = await this.apiKey()
    return (this.deps.createClient ?? createClient)(key)
  }

  async list(search: string): Promise<ComposioToolkit[]> {
    const key = await this.apiKey()
    const url = new URL('https://backend.composio.dev/api/v3.1/toolkits')
    url.searchParams.set('limit', '50')
    url.searchParams.set('sort_by', 'alphabetically')
    if (search.trim()) url.searchParams.set('search', search.trim().slice(0, 100))

    const response = await this.fetchImpl(url, { headers: { 'x-api-key': key } })
    if (!response.ok) {
      throw new Error(`Composio app catalog request failed (${response.status}). Check your project key and try again.`)
    }
    const parsed = ToolkitResponseSchema.safeParse(await response.json())
    if (!parsed.success) throw new Error('Composio returned an invalid app catalog response.')

    const items = parsed.data.items
    const session = await (this.deps.createClient ?? createClient)(key)
      .sessions.create(COMPOSIO_USER_ID, { toolkits: items.map((item) => item.slug), manageConnections: false })
    const connectionState = await session.toolkits({
      toolkits: items.map((item) => item.slug),
      limit: 50
    })
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
    const session = await (await this.client()).sessions.create(COMPOSIO_USER_ID, {
      toolkits: [toolkit],
      manageConnections: false
    })
    const request = await session.authorize(toolkit)
    const redirectUrl = secureUrl(request.redirectUrl)
    if (!redirectUrl) throw new Error('Composio did not return a secure connection link.')
    return redirectUrl
  }
}
