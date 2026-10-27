import { describe, expect, it, vi } from 'vitest'
import { ComposioMarketplace, type ComposioMarketplaceDependencies } from '../../src/main/engines/composio/composio-marketplace.js'

function setup(options?: {
  key?: string | null
  response?: unknown
  redirectUrl?: string
  connected?: boolean
  responseOk?: boolean
  createClientError?: Error
}): {
  marketplace: ComposioMarketplace
  fetch: ReturnType<typeof vi.fn>
  authorize: ReturnType<typeof vi.fn>
} {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(options?.response ?? {
    items: [
      {
        slug: 'gmail',
        name: 'Gmail',
        meta: {
          description: 'Email service',
          logo: 'https://cdn.example/gmail.svg',
          app_url: 'http://example.com',
          tools_count: 12,
          categories: [{ name: 'Email' }]
        }
      }
    ]
  }), { status: options?.responseOk === false ? 503 : 200 }))
  const authorize = vi.fn(async () => ({ redirectUrl: options?.redirectUrl ?? 'https://connect.example/auth' }))
  const dependencies: ComposioMarketplaceDependencies = {
    getApiKey: async () => options?.key === undefined ? 'ak_test_key' : options.key,
    fetch,
    createClient: () => {
      if (options?.createClientError) throw options.createClientError
      return {
      sessions: {
        create: async () => ({
          authorize,
          toolkits: async () => ({
            items: [{
              slug: 'gmail',
              name: 'Gmail',
              connection: { isActive: options?.connected ?? true }
            }]
          })
        })
      }
      }
    }
  }
  return { marketplace: new ComposioMarketplace(dependencies), fetch, authorize }
}

describe('ComposioMarketplace', () => {
  it('validates catalog data, exposes only secure branding URLs, and reports connection state', async () => {
    const { marketplace, fetch } = setup()
    await expect(marketplace.list('gmail')).resolves.toEqual([{
      slug: 'gmail',
      name: 'Gmail',
      description: 'Email service',
      logo: 'https://cdn.example/gmail.svg',
      appUrl: undefined,
      toolsCount: 12,
      categories: ['Email'],
      connected: true
    }])
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ headers: { 'x-api-key': 'ak_test_key' } })
    )
    const requestedUrl = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(requestedUrl.searchParams.get('search')).toBe('gmail')
    expect(requestedUrl.searchParams.get('limit')).toBe('50')
  })

  it('requires a configured key and rejects invalid catalog responses', async () => {
    const noKey = setup({ key: null })
    await expect(noKey.marketplace.list('')).rejects.toThrow(/project key/)

    const invalid = setup({ response: { items: [{ slug: 'oops' }] } })
    await expect(invalid.marketplace.list('')).rejects.toThrow(/invalid app catalog/)
  })

  it('validates keys before storing and explains missing session permissions', async () => {
    const permissions = setup({ createClientError: new Error('403: not allowed to create sessions') })
    await expect(permissions.marketplace.validateApiKey('ak_test_key')).rejects.toThrow(
      /Session management and Session tool execution/
    )
    const revoked = setup({ createClientError: new Error('401 unauthorized: API key revoked') })
    await expect(revoked.marketplace.validateApiKey('ak_test_key')).rejects.toThrow(/revoked or expired/)
    await expect(revoked.marketplace.validateApiKey('not-a-key')).rejects.toThrow(/must start with "ak_"/)
  })

  it('fails explicitly when the catalog request is unsuccessful', async () => {
    const { marketplace } = setup({ responseOk: false })
    await expect(marketplace.list('')).rejects.toThrow(/request failed \(503\)/)
  })

  it('creates a secure hosted auth link for the selected toolkit', async () => {
    const { marketplace, authorize } = setup()
    await expect(marketplace.connect('gmail')).resolves.toBe('https://connect.example/auth')
    expect(authorize).toHaveBeenCalledWith('gmail')
  })

  it('connects to notion and authorizes the hosted connect link', async () => {
    const { marketplace, authorize } = setup()
    await expect(marketplace.connect('notion')).resolves.toBe('https://connect.example/auth')
    expect(authorize).toHaveBeenCalledWith('notion')
  })

  it('rejects insecure auth links', async () => {
    const { marketplace } = setup({ redirectUrl: 'http://connect.example/auth' })
    await expect(marketplace.connect('gmail')).rejects.toThrow(/secure connection link/)
  })
})
