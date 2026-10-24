import { describe, expect, it, vi } from 'vitest'
import { initSpotlight } from '../../src/renderer/design/spotlight.js'

describe('cursor spotlight', () => {
  it('is a safe no-op outside a DOM (SSR/terminal tests)', () => {
    expect(() => initSpotlight(undefined as unknown as ParentNode)).not.toThrow()
  })

  it('installs no listeners when the user prefers reduced motion', () => {
    const root = { querySelectorAll: () => [] } as unknown as ParentNode
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(() => initSpotlight(root)).not.toThrow()
    vi.unstubAllGlobals()
  })
})
