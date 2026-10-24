/**
 * The one time-format helper. All UI surfaces read these so the app shows a
 * single format per user. Locale drives 12h/24h, the user's timezone is
 * always local, and results are cached per locale to keep re-renders cheap.
 */

let localeCache: { source: Intl.Locale | string; tags: string[] } | null = null

function localeTags(): string[] {
  const navigatorLocale = typeof navigator !== 'undefined' && navigator.language
    ? navigator.language
    : 'en-US'
  /* `nextTag` is roughly the closest supported locale for this runtime. */
  if (!localeCache || localeCache.source !== navigatorLocale) {
    localeCache = {
      source: navigatorLocale,
      tags: [navigatorLocale, navigatorLocale.split('-')[0] ?? 'en-US']
    }
  }
  return localeCache.tags
}

/** "9:45 AM" or "09:45" (locale decides). */
export function formatTime(at: number | Date): string {
  const date = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString(localeTags(), { hour: 'numeric', minute: '2-digit' })
}

/** "9:45 AM · Oct 24, 2026" style, joined with a separator. */
export function formatDateTime(at: number | Date): string {
  const date = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(localeTags(), {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  })
}

/** "Oct 24, 2026" */
export function formatDate(at: number | Date): string {
  const date = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(localeTags(), { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Jul 2026" */
export function formatMonth(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString(localeTags(), { month: 'short', year: 'numeric' })
}

/** A relative "at HH:mm" suffix for schedule lines. */
export function formatAt(at: number | Date): string {
  return `at ${formatTime(at)}`
}
