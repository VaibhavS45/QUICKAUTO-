import { describe, expect, it } from 'vitest'
import { ShellRouter } from '../../src/renderer/shell/nav.js'

describe('ShellRouter', () => {
  it('publishes navigation and falls back to home for unknown views', () => {
    const router = new ShellRouter()
    const seen: string[] = []
    router.subscribe((route) => seen.push(route.view))
    router.navigate('automations', { focusId: 'routine-1' })
    expect(router.current).toEqual({ view: 'automations', params: { focusId: 'routine-1' } })
    router.navigate('chat', { chatId: 'thread-1' })
    expect(router.current).toEqual({ view: 'chat', params: { chatId: 'thread-1' } })
    router.navigate('unknown-view')
    expect(seen).toEqual(['automations', 'chat', 'home'])
    expect(router.current).toEqual({ view: 'home', params: {} })
  })
})
