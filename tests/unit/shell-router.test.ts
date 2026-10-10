import { describe, expect, it } from 'vitest'
import { createShellRouter } from '../../src/renderer/shell/router.js'

describe('shell router', () => {
  it('keeps navigation and params in memory', () => {
    const router = createShellRouter()
    expect(router.getRoute()).toEqual({ view: 'home', params: {} })
    expect(router.navigate('automations', { focusId: 'routine-1' })).toEqual({
      view: 'automations',
      params: { focusId: 'routine-1' }
    })
    expect(router.getRoute()).toEqual({ view: 'automations', params: { focusId: 'routine-1' } })
  })

  it('replaces the current route when navigating without params', () => {
    const router = createShellRouter('plugins')
    router.navigate('home')
    expect(router.getRoute()).toEqual({ view: 'home', params: {} })
  })
})
