export interface SearchResult {
  title: string
  url: string
  snippet: string
  source?: string
  domain?: string
  publishedAt?: string | null
}

export interface WebSearchPayload {
  query: string
  provider: string
  answer?: string
  results: SearchResult[]
  sources: Array<{ title: string; url: string; source?: string }>
  searchedAt: string
}

export interface WebSearchProvider {
  name: string
  search: (query: string, maxResults?: number) => Promise<WebSearchPayload>
}

const lastSearch: { value: WebSearchPayload | null } = { value: null }

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeUrl(value: string | undefined): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    return /^https?:$/.test(url.protocol) ? url.toString() : ''
  } catch {
    return /^https?:\/\//i.test(trimmed) ? trimmed : ''
  }
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

function toSearchResult(title: string, url: string, snippet: string, publishedAt?: string | null): SearchResult {
  const cleanedUrl = normalizeUrl(url)
  return {
    title: title.trim() || 'Untitled result',
    url: cleanedUrl || 'about:blank',
    snippet: stripHtml(snippet || '').slice(0, 400),
    source: domainFromUrl(cleanedUrl),
    domain: domainFromUrl(cleanedUrl),
    publishedAt: publishedAt ?? null
  }
}

function uniqueResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  return results.filter((result) => {
    const key = `${result.title}|${result.url}`
    if (!result.url || result.url === 'about:blank') return false
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sourceQuery(query: string): boolean {
  return /(\bsources?\b|\bwhere did you get this information\b|\bcite sources?\b|\bshow sources?\b)/i.test(query)
}

function parseDuckDuckGo(data: Record<string, unknown>, query: string, maxResults: number): WebSearchPayload {
  const results: SearchResult[] = []

  const addResult = (title: unknown, url: unknown, snippet: unknown, publishedAt?: unknown) => {
    const resolvedTitle = typeof title === 'string' ? stripHtml(title) : ''
    const resolvedUrl = typeof url === 'string' ? normalizeUrl(url) : ''
    const resolvedSnippet = typeof snippet === 'string' ? stripHtml(snippet) : ''
    if (!resolvedUrl) return
    results.push(toSearchResult(resolvedTitle || 'Result', resolvedUrl, resolvedSnippet, typeof publishedAt === 'string' ? publishedAt : undefined))
  }

  if (Array.isArray((data as Record<string, unknown>).Results)) {
    for (const item of (data as Record<string, unknown>).Results as Array<Record<string, unknown>>) {
      addResult(item?.Text, item?.FirstURL, item?.Text)
    }
  }

  for (const topic of Array.isArray((data as Record<string, unknown>).RelatedTopics) ? ((data as Record<string, unknown>).RelatedTopics as unknown[]) : []) {
    if (typeof topic === 'object' && topic !== null) {
      const obj = topic as Record<string, unknown>
      if (typeof obj['FirstURL'] === 'string' && typeof obj['Text'] === 'string') {
        addResult(obj['Text'], obj['FirstURL'], obj['Text'])
      }
      if (Array.isArray(obj['Topics'])) {
        for (const sub of obj['Topics'] as Array<Record<string, unknown>>) {
          if (typeof sub?.['FirstURL'] === 'string' && typeof sub?.['Text'] === 'string') {
            addResult(sub['Text'], sub['FirstURL'], sub['Text'])
          }
        }
      }
    }
  }

  const answer = typeof (data as Record<string, unknown>).AbstractText === 'string'
    ? (data as Record<string, unknown>).AbstractText as string
    : typeof (data as Record<string, unknown>).Abstract === 'string'
      ? (data as Record<string, unknown>).Abstract as string
      : undefined

  const payload: WebSearchPayload = {
    query,
    provider: 'duckduckgo',
    answer: answer ? stripHtml(answer) : results[0]?.snippet || 'No answer field returned by the search provider.',
    results: uniqueResults(results).slice(0, maxResults),
    sources: uniqueResults(results)
      .slice(0, maxResults)
      .map((result) => ({ title: result.title, url: result.url, source: result.source })),
    searchedAt: new Date().toISOString()
  }
  lastSearch.value = payload
  return payload
}

export function getLastWebSearch(): WebSearchPayload | null {
  return lastSearch.value ? { ...lastSearch.value, sources: [...lastSearch.value.sources] } : null
}

export function isWebSearchSourceRequest(query: string): boolean {
  return sourceQuery(query)
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Palette/1.0 (+https://github.com/vaibhav/Projects/auto)',
      ...(init?.headers ?? {})
    }
  })
  if (!res.ok) {
    throw new Error(`Web search request failed (${res.status} ${res.statusText})`)
  }
  const data = (await res.json()) as Record<string, unknown>
  return data
}

export class DuckDuckGoProvider implements WebSearchProvider {
  readonly name = 'duckduckgo'

  async search(query: string, maxResults = 5): Promise<WebSearchPayload> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`
    const data = await fetchJson(url)
    return parseDuckDuckGo(data, query, maxResults)
  }
}

export class WikipediaSearchProvider implements WebSearchProvider {
  readonly name = 'wikipedia'

  async search(query: string, maxResults = 5): Promise<WebSearchPayload> {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=${Math.min(maxResults, 10)}&srsearch=${encodeURIComponent(query)}`
    const data = await fetchJson(url)
    const items = Array.isArray(asRecord(data['query'])['search'])
      ? (asRecord(data['query'])['search'] as Array<Record<string, unknown>>)
      : []

    const results = items.map((item) => {
      const title = typeof item['title'] === 'string' ? item['title'] : 'Wikipedia result'
      const snippet = typeof item['snippet'] === 'string' ? stripHtml(item['snippet']) : ''
      const pageId = typeof item['pageid'] === 'number' ? item['pageid'] : undefined
      const pageUrl = pageId ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}` : ''
      return toSearchResult(title, pageUrl, snippet)
    })

    const payload: WebSearchPayload = {
      query,
      provider: this.name,
      answer: results[0]?.snippet || `I found ${results.length} public Wikipedia references related to "${query}".`,
      results: uniqueResults(results).slice(0, maxResults),
      sources: uniqueResults(results)
        .slice(0, maxResults)
        .map((result) => ({ title: result.title, url: result.url, source: result.source })),
      searchedAt: new Date().toISOString()
    }
    lastSearch.value = payload
    return payload
  }
}

export class BraveSearchProvider implements WebSearchProvider {
  readonly name = 'brave'

  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults = 5): Promise<WebSearchPayload> {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(maxResults, 10)}&search_lang=en&country=US`
    const auth = 'Bearer ' + this.apiKey
    const data = await fetchJson(url, { headers: { Authorization: auth } })
    const web = asRecord(data['web'])
    const items = Array.isArray(web['results']) ? (web['results'] as Array<Record<string, unknown>>) : []
    const results = items.map((item) =>
      toSearchResult(
        typeof item['title'] === 'string' ? item['title'] : 'Result',
        typeof item['url'] === 'string' ? item['url'] : '',
        typeof item['description'] === 'string' ? item['description'] : '',
        typeof item['age'] === 'string' ? item['age'] : undefined
      )
    )
    const payload: WebSearchPayload = {
      query,
      provider: this.name,
      answer: results[0]?.snippet || 'No answer field returned by the search provider.',
      results: uniqueResults(results).slice(0, maxResults),
      sources: uniqueResults(results)
        .slice(0, maxResults)
        .map((result) => ({ title: result.title, url: result.url, source: result.source })),
      searchedAt: new Date().toISOString()
    }
    lastSearch.value = payload
    return payload
  }
}

export class SerpApiProvider implements WebSearchProvider {
  readonly name = 'serpapi'

  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults = 5): Promise<WebSearchPayload> {
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(this.apiKey)}&num=${Math.min(maxResults, 10)}`
    const data = await fetchJson(url)
    const items = Array.isArray(data['organic_results'])
      ? (data['organic_results'] as Array<Record<string, unknown>>)
      : []
    const answerBox = asRecord(data['answer_box'])
    const answer = typeof answerBox['answer'] === 'string'
      ? String(answerBox['answer'])
      : typeof answerBox['snippet'] === 'string'
        ? String(answerBox['snippet'])
        : typeof items[0]?.['snippet'] === 'string'
          ? String(items[0]?.['snippet'])
          : 'No answer field returned by the search provider.'
    const results = items.map((item) =>
      toSearchResult(
        typeof item['title'] === 'string' ? item['title'] : 'Result',
        typeof item['link'] === 'string' ? item['link'] : '',
        typeof item['snippet'] === 'string' ? item['snippet'] : '',
        typeof item['date'] === 'string' ? item['date'] : undefined
      )
    )
    const payload: WebSearchPayload = {
      query,
      provider: this.name,
      answer: stripHtml(answer),
      results: uniqueResults(results).slice(0, maxResults),
      sources: uniqueResults(results)
        .slice(0, maxResults)
        .map((result) => ({ title: result.title, url: result.url, source: result.source })),
      searchedAt: new Date().toISOString()
    }
    lastSearch.value = payload
    return payload
  }
}

export function resolveWebSearchProvider(): WebSearchProvider {
  const providerName = (process.env.PALETTE_WEBSEARCH_PROVIDER ?? process.env.WEBSEARCH_PROVIDER ?? '').trim().toLowerCase()
  const braveKey = (process.env.BRAVE_SEARCH_API_KEY ?? process.env.BRAVE_API_KEY ?? '').trim()
  const serpApiKey = (process.env.SERPAPI_API_KEY ?? process.env.SERP_API_KEY ?? '').trim()

  if (providerName === 'brave' || (!providerName && braveKey)) {
    if (!braveKey) {
      throw new Error('Web search is not configured. Please set BRAVE_SEARCH_API_KEY (or PALETTE_WEBSEARCH_PROVIDER=brave).')
    }
    return new BraveSearchProvider(braveKey)
  }

  if (providerName === 'serpapi' || (!providerName && serpApiKey)) {
    if (!serpApiKey) {
      throw new Error('Web search is not configured. Please set SERPAPI_API_KEY (or PALETTE_WEBSEARCH_PROVIDER=serpapi).')
    }
    return new SerpApiProvider(serpApiKey)
  }

  return new DuckDuckGoProvider()
}

export async function performWebSearch(
  query: string,
  maxResults = 5,
  overrideProvider?: WebSearchProvider
): Promise<WebSearchPayload> {
  const trimmed = query.trim()
  if (!trimmed) throw new Error('Web search requires a non-empty query.')

  if (isWebSearchSourceRequest(trimmed)) {
    const cached = getLastWebSearch()
    if (!cached) {
      throw new Error('There is no previous web search result to cite yet. Run a web search first.')
    }
    return {
      ...cached,
      query: 'sources',
      answer: cached.answer ?? 'Sources from the previous web search result.',
      results: cached.results,
      sources: cached.sources,
      provider: `sources:${cached.provider}`
    }
  }

  const provider = overrideProvider ?? resolveWebSearchProvider()
  const payload = await provider.search(trimmed, maxResults)

  if (
    payload.results.length === 0 &&
    payload.answer &&
    /No answer field returned by the search provider\./i.test(payload.answer)
  ) {
    const wiki = new WikipediaSearchProvider()
    const fallback = await wiki.search(trimmed, maxResults)
    if (fallback.results.length > 0) {
      lastSearch.value = fallback
      return fallback
    }
  }

  lastSearch.value = payload
  return payload
}
